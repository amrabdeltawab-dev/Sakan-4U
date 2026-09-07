begin;

drop policy if exists "approved owners create pending properties" on public.properties;
create policy "approved owners create draft or pending properties" on public.properties for insert to authenticated
  with check (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role and verification_status in ('draft'::public.verification_status, 'pending'::public.verification_status));

drop policy if exists "owners edit their pending properties" on public.properties;
create policy "owners edit controlled properties" on public.properties for update to authenticated
  using (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role)
  with check (owner_id = auth.uid() and verification_status in ('draft'::public.verification_status, 'pending'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status));

drop policy if exists "owner deletes own properties" on public.properties;
drop policy if exists "staff manage properties" on public.properties;
create policy "staff read managed properties" on public.properties for select to authenticated using (private.is_staff());
create policy "staff update managed properties" on public.properties for update to authenticated using (private.is_staff()) with check (private.is_staff());

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status and current_setting('app.property_lifecycle_operation', true) is distinct from 'owner_availability' then
      raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501';
    end if;
    if old.verification_status is distinct from new.verification_status and not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then
      raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owner_property_lifecycle on public.properties;
create trigger enforce_owner_property_lifecycle before update on public.properties for each row execute procedure private.enforce_owner_property_lifecycle();

create or replace function public.owner_set_property_availability(target_property_id uuid, target_availability public.availability_status)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  if target_availability = 'available'::public.availability_status and property_row.verification_status <> 'verified'::public.verification_status then raise exception 'لا يمكن إظهار العقار للطلاب قبل اعتماده من الإدارة.' using errcode = '42501'; end if;
  perform set_config('app.property_lifecycle_operation', 'owner_availability', true);
  update public.properties set availability_status = target_availability where id = property_row.id returning * into property_row;
  return property_row;
end;
$$;

revoke all on function private.enforce_owner_property_lifecycle() from public, anon, authenticated;

commit;
