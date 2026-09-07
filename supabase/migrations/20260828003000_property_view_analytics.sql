begin;

alter table public.properties
  add column if not exists views_count integer not null default 0;

alter table public.properties
  drop constraint if exists properties_views_count_nonnegative_check,
  add constraint properties_views_count_nonnegative_check check (views_count >= 0);

create table if not exists public.property_view_sessions (
  property_id uuid not null references public.properties(id) on delete cascade,
  visitor_session_id uuid not null,
  recorded_at timestamptz not null default now(),
  primary key (property_id, visitor_session_id)
);

create index if not exists property_view_sessions_recorded_at_idx
  on public.property_view_sessions (recorded_at desc);

alter table public.property_view_sessions enable row level security;
revoke all on table public.property_view_sessions from public, anon, authenticated;

create or replace function private.enforce_property_view_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.views_count is distinct from old.views_count
     and current_setting('app.property_view_operation', true) is distinct from 'increment' then
    raise exception 'لا يمكن تعديل عداد مشاهدات العقار مباشرة.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.preserve_property_view_counter_timestamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.views_count is distinct from old.views_count
     and current_setting('app.property_view_operation', true) = 'increment' then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_enforce_property_view_counter on public.properties;
create trigger properties_enforce_property_view_counter
before update of views_count on public.properties
for each row execute procedure private.enforce_property_view_counter();

drop trigger if exists properties_z_preserve_property_view_counter_timestamp on public.properties;
create trigger properties_z_preserve_property_view_counter_timestamp
before update of views_count on public.properties
for each row execute procedure private.preserve_property_view_counter_timestamp();

create or replace function public.record_property_view(target_property_id uuid, p_visitor_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
  -- Count only a currently discoverable property and serialize the increment
  -- with the property row lock. The caller supplies a random browser-session
  -- identifier; the unique key admits no more than one view per property per
  -- browser session.
  select * into property_row
  from public.properties
  where id = target_property_id
    and deleted_at is null
    and verification_status = 'verified'::public.verification_status
    and availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
    and (rent_type = 'full'::public.rent_type or available_beds > 0)
  for update;

  if not found then return false; end if;

  insert into public.property_view_sessions (property_id, visitor_session_id)
  values (property_row.id, p_visitor_session_id)
  on conflict (property_id, visitor_session_id) do nothing;

  if not found then return false; end if;

  perform set_config('app.property_view_operation', 'increment', true);
  update public.properties
  set views_count = views_count + 1
  where id = property_row.id;
  return true;
end;
$$;

create or replace function public.get_total_property_views()
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'هذه الإحصائية مخصصة للمدير العام.' using errcode = '42501';
  end if;
  return coalesce((select sum(views_count)::bigint from public.properties), 0::bigint);
end;
$$;

revoke all on function private.enforce_property_view_counter(), private.preserve_property_view_counter_timestamp() from public, anon, authenticated;
revoke all on function public.record_property_view(uuid, uuid) from public;
revoke all on function public.record_property_view(uuid, uuid) from anon, authenticated;
grant execute on function public.record_property_view(uuid, uuid) to service_role;
revoke all on function public.get_total_property_views() from public, anon;
grant execute on function public.get_total_property_views() to authenticated, service_role;

commit;
