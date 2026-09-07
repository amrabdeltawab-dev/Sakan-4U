create or replace function private.bootstrap_super_admin_once(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding uuid;
begin
  select user_id into existing_binding
  from public.super_admin_bootstrap
  where singleton = true
  for update;

  if found then
    return false;
  end if;

  update public.profiles
  set role = 'super_admin'::public.app_role
  where id = target_user_id;

  if not found then
    return false;
  end if;

  insert into public.super_admin_bootstrap (singleton, user_id)
  values (true, target_user_id);

  return true;
end;
$$;

revoke all on function private.bootstrap_super_admin_once(uuid) from public, anon, authenticated;
grant execute on function private.bootstrap_super_admin_once(uuid) to service_role;

commit;
