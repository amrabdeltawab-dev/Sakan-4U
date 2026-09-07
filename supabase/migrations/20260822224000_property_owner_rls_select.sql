begin;

grant select (owner_id) on public.properties to authenticated;

commit;
