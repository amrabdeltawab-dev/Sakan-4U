-- PostgREST resolves unqualified RPC calls against the public schema.  Keep the
-- state-changing implementation private, and expose only this service-role façade.
create or replace function public.bootstrap_super_admin_once(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.bootstrap_super_admin_once(target_user_id);
$$;

revoke all on function public.bootstrap_super_admin_once(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_super_admin_once(uuid) to service_role;
