begin;

drop function if exists public.record_property_view(uuid, uuid);

create function public.record_property_view(target_property_id uuid, p_visitor_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
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

revoke all on function public.record_property_view(uuid, uuid) from public;
revoke all on function public.record_property_view(uuid, uuid) from anon, authenticated;
grant execute on function public.record_property_view(uuid, uuid) to service_role;

commit;
