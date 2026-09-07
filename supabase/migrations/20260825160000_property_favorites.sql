begin;

create table if not exists public.property_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create index if not exists property_favorites_user_created_idx
  on public.property_favorites (user_id, created_at desc);

alter table public.property_favorites enable row level security;
revoke all on public.property_favorites from public, anon, authenticated;
grant select, insert, delete on public.property_favorites to authenticated;

drop policy if exists property_favorites_select_own_student on public.property_favorites;
create policy property_favorites_select_own_student on public.property_favorites
  for select to authenticated
  using (user_id = auth.uid() and private.current_user_role() = 'student'::public.app_role);

drop policy if exists property_favorites_insert_own_public_property on public.property_favorites;
create policy property_favorites_insert_own_public_property on public.property_favorites
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.current_user_role() = 'student'::public.app_role
    and exists (
      select 1 from public.properties p
      where p.id = property_id
        and p.verification_status = 'verified'::public.verification_status
        and p.availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
    )
  );

drop policy if exists property_favorites_delete_own_student on public.property_favorites;
create policy property_favorites_delete_own_student on public.property_favorites
  for delete to authenticated
  using (user_id = auth.uid() and private.current_user_role() = 'student'::public.app_role);

commit;
