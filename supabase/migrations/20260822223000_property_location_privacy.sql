begin;

revoke select (street, approximate_location, latitude, longitude) on public.properties from anon, authenticated;

commit;
