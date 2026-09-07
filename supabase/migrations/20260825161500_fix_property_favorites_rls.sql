begin;

create or replace function private.is_favoritable_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = target_property_id
      and p.verification_status = 'verified'::public.verification_status
      and p.availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
  )
$$;

revoke all on function private.is_favoritable_property(uuid) from public, anon;
grant execute on function private.is_favoritable_property(uuid) to authenticated, service_role;

drop policy if exists property_favorites_insert_own_public_property on public.property_favorites;
create policy property_favorites_insert_own_public_property on public.property_favorites
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.current_user_role() = 'student'::public.app_role
    and private.is_favoritable_property(property_id)
  );

commit;
