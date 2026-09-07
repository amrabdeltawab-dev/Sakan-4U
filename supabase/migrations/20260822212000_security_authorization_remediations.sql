create table if not exists public.super_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  bootstrapped_at timestamptz not null default now()
);

alter table public.super_admin_bootstrap enable row level security;
revoke all on table public.super_admin_bootstrap from anon, authenticated;

drop policy if exists "owners upload owned public image path" on storage.objects;

commit;
