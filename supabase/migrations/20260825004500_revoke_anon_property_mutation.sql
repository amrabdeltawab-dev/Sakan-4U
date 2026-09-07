begin;

revoke insert, update, delete on public.properties from anon;

commit;
