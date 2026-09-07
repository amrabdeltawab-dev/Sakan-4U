begin;

revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

drop policy if exists profiles_update_own_contact on public.profiles;
create policy profiles_update_own_contact on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and char_length(trim(full_name)) between 2 and 160
    and (phone is null or char_length(trim(phone)) between 6 and 32)
  );

commit;
