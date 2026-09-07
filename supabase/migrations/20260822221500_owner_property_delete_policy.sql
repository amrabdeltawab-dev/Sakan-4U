begin;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'properties'
      and policyname = 'owners delete their managed properties'
  ) then
    create policy "owners delete their managed properties" on public.properties
      for delete to authenticated
      using (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role);
  end if;
end;
$$;

commit;
