-- Properties are archived through trusted functions; direct authenticated DELETE
-- would bypass historical booking and media retention.
drop policy if exists "owners delete their managed properties" on public.properties;

revoke delete on table public.properties from anon, authenticated;
