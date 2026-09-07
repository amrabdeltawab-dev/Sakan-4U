begin;

create table if not exists public.super_admin_user_management_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null,
  target_role public.app_role not null,
  action text not null check (action in ('delete_user')),
  result text not null check (result in ('requested', 'succeeded', 'failed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists super_admin_user_management_audit_actor_created_idx
  on public.super_admin_user_management_audit (actor_id, created_at desc);
create index if not exists super_admin_user_management_audit_target_created_idx
  on public.super_admin_user_management_audit (target_user_id, created_at desc);

alter table public.super_admin_user_management_audit enable row level security;
revoke all on table public.super_admin_user_management_audit from public, anon, authenticated;

commit;
