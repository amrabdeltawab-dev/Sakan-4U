begin;

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  area text,
  max_price integer check (max_price is null or max_price > 0),
  min_beds integer check (min_beds is null or min_beds > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_student_idx on public.saved_searches (student_id);
create index if not exists saved_searches_active_idx on public.saved_searches (active) where active = true;

alter table public.saved_searches enable row level security;

drop policy if exists "select_own_saved_searches" on public.saved_searches;
create policy "select_own_saved_searches" on public.saved_searches
  for select to authenticated using (auth.uid() = student_id);

drop policy if exists "insert_own_saved_searches" on public.saved_searches;
create policy "insert_own_saved_searches" on public.saved_searches
  for insert to authenticated with check (auth.uid() = student_id);

drop policy if exists "update_own_saved_searches" on public.saved_searches;
create policy "update_own_saved_searches" on public.saved_searches
  for update to authenticated using (auth.uid() = student_id) with check (auth.uid() = student_id);

drop policy if exists "delete_own_saved_searches" on public.saved_searches;
create policy "delete_own_saved_searches" on public.saved_searches
  for delete to authenticated using (auth.uid() = student_id);

commit;
