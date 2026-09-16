-- Owner leads table for public lead capture from the landing page.
-- Allows visitors without an account to submit their contact info
-- so staff can follow up about adding their properties.
-- Note: Admin SELECT/UPDATE policies depend on profiles table which
-- doesn't exist yet. Server code uses service role key (bypasses RLS).

create table if not exists public.owner_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  phone text not null check (char_length(trim(phone)) between 6 and 32),
  area text not null check (char_length(trim(area)) between 2 and 120),
  approximate_property_count integer check (approximate_property_count is null or (approximate_property_count between 1 and 999)),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  source text not null default 'landing_page' check (source in ('landing_page', 'manual', 'referral')),
  consent_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_leads_status_idx on public.owner_leads (status);
create index if not exists owner_leads_created_at_idx on public.owner_leads (created_at desc);

alter table public.owner_leads enable row level security;

-- Public can insert leads (no account needed) — consent required, limited columns
create policy "public_insert_owner_leads" on public.owner_leads
  for insert to anon, authenticated
  with check (
    name is not null and char_length(trim(name)) between 2 and 160
    and phone is not null and char_length(trim(phone)) between 6 and 32
    and area is not null and char_length(trim(area)) between 2 and 120
    and consent_accepted = true
  );