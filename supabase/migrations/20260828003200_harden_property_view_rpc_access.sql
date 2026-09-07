begin;

revoke all on function public.record_property_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_property_view(uuid, uuid) to service_role;

commit;
