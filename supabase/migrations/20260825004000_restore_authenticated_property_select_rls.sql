begin;

-- Existing owner/staff RLS predicates provide the role-aware row boundary for
-- exact coordinates. Restoring this grant repairs protected owner/admin flows;
-- unauthenticated access remains restricted to the curated public column list.
grant select on public.properties to authenticated;
revoke select (latitude, longitude, exact_lat, exact_lng, street) on public.properties from anon;

commit;
