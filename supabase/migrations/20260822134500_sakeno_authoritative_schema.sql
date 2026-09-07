begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

do $$ begin
  create type public.app_role as enum ('student', 'owner', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.owner_application_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.property_type as enum ('apartment', 'studio', 'room', 'shared_room');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.gender_suitability as enum ('male', 'female', 'mixed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.verification_status as enum ('pending', 'verified', 'needs_changes', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.availability_status as enum ('available', 'reserved', 'rented', 'hidden');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.media_type as enum ('image', 'video', 'verification_document');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_status as enum ('pending', 'contacted', 'owner_confirmed', 'student_confirmed', 'completed', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null unique,
  phone text,
  role public.app_role not null default 'student',
  owner_onboarding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  phone text not null check (char_length(trim(phone)) between 6 and 32),
  onboarding_data jsonb not null default '{}'::jsonb,
  status public.owner_application_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 4 and 180),
  property_type public.property_type not null,
  governorate text not null check (char_length(trim(governorate)) between 2 and 100),
  city text not null check (char_length(trim(city)) between 2 and 100),
  area text not null check (char_length(trim(area)) between 2 and 120),
  street text,
  approximate_location text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  description text not null check (char_length(trim(description)) >= 20),
  monthly_price integer not null check (monthly_price > 0),
  bedrooms smallint not null check (bedrooms > 0),
  bathrooms smallint not null check (bathrooms > 0),
  capacity smallint not null check (capacity > 0),
  gender_suitability public.gender_suitability not null default 'mixed',
  furnished boolean not null default true,
  amenities jsonb not null default '[]'::jsonb,
  verification_status public.verification_status not null default 'pending',
  availability_status public.availability_status not null default 'available',
  owner_identity_verified boolean not null default false,
  property_video_verified boolean not null default false,
  location_verified boolean not null default false,
  availability_verified boolean not null default false,
  review_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_bucket text not null check (storage_bucket in ('property-images', 'property-media-staging', 'verification-documents')),
  storage_path text not null unique,
  original_name text not null check (char_length(trim(original_name)) between 1 and 255),
  mime_type text not null check (mime_type ~ '^(image/|video/|application/pdf$)'),
  media_type public.media_type not null,
  is_primary boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  check ((media_type = 'verification_document' and is_public = false) or media_type <> 'verification_document')
);

create unique index if not exists property_media_one_primary_per_property_idx
  on public.property_media (property_id) where is_primary;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 160),
  phone text not null check (char_length(trim(phone)) between 6 and 32),
  people_count smallint not null default 1 check (people_count between 1 and 8),
  preferred_contact_time text not null default 'any' check (preferred_contact_time in ('morning', 'afternoon', 'evening', 'any')),
  notes text,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_review_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  status public.verification_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists properties_public_discovery_idx on public.properties (verification_status, availability_status, governorate, city, area);
create index if not exists properties_owner_idx on public.properties (owner_id, updated_at desc);
create index if not exists property_media_property_visibility_idx on public.property_media (property_id, is_public);
create index if not exists bookings_student_idx on public.bookings (student_id, status, updated_at desc);
create index if not exists bookings_property_idx on public.bookings (property_id, status, updated_at desc);
create index if not exists owner_applications_status_idx on public.owner_applications (status, created_at asc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role() in ('admin'::public.app_role, 'super_admin'::public.app_role)), false)
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role() = 'super_admin'::public.app_role), false)
$$;

create or replace function private.owns_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.properties p where p.id = target_property_id and p.owner_id = auth.uid())
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), coalesce(new.email, 'مستخدم جديد')),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure private.set_updated_at();
drop trigger if exists owner_applications_set_updated_at on public.owner_applications;
create trigger owner_applications_set_updated_at before update on public.owner_applications for each row execute procedure private.set_updated_at();
drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at before update on public.properties for each row execute procedure private.set_updated_at();
drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings for each row execute procedure private.set_updated_at();

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.current_user_role() to anon, authenticated, service_role;
grant execute on function private.is_staff() to anon, authenticated, service_role;
grant execute on function private.is_super_admin() to authenticated, service_role;
grant execute on function private.owns_property(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.owner_applications enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.bookings enable row level security;
alter table public.property_review_events enable row level security;

create policy "profiles select own or staff" on public.profiles for select
  using (id = auth.uid() or private.is_staff());

create policy "owner applications select own or staff" on public.owner_applications for select
  using (user_id = auth.uid() or private.is_staff());
create policy "owner applications create own pending request" on public.owner_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending'::public.owner_application_status);
create policy "owner applications edit own pending request" on public.owner_applications for update to authenticated
  using (user_id = auth.uid() and status = 'pending'::public.owner_application_status)
  with check (user_id = auth.uid() and status = 'pending'::public.owner_application_status);
create policy "staff manage owner applications" on public.owner_applications for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "public read verified available properties" on public.properties for select
  using (verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status);
create policy "owners and staff read managed properties" on public.properties for select to authenticated
  using (owner_id = auth.uid() or private.is_staff());
create policy "approved owners create pending properties" on public.properties for insert to authenticated
  with check (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role and verification_status = 'pending'::public.verification_status);
create policy "owners edit their pending properties" on public.properties for update to authenticated
  using (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role)
  with check (owner_id = auth.uid() and verification_status = 'pending'::public.verification_status);
create policy "staff manage properties" on public.properties for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "public read published media" on public.property_media for select
  using (is_public = true and media_type <> 'verification_document'::public.media_type);
create policy "owners and staff read managed media" on public.property_media for select to authenticated
  using (private.owns_property(property_id) or private.is_staff());
create policy "owners add nonpublic media to owned property" on public.property_media for insert to authenticated
  with check (private.owns_property(property_id) and private.current_user_role() = 'owner'::public.app_role and is_public = false);
create policy "owners edit owned nonpublic media" on public.property_media for update to authenticated
  using (private.owns_property(property_id)) with check (private.owns_property(property_id) and is_public = false);
create policy "staff manage media" on public.property_media for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "students read own bookings" on public.bookings for select to authenticated
  using (student_id = auth.uid() or private.owns_property(property_id) or private.is_staff());
create policy "students create own bookings" on public.bookings for insert to authenticated
  with check (student_id = auth.uid() and private.current_user_role() = 'student'::public.app_role and status = 'pending'::public.booking_status);
create policy "students update own booking confirmation" on public.bookings for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid() and status in ('student_confirmed'::public.booking_status, 'cancelled'::public.booking_status));
create policy "owners update owned booking status" on public.bookings for update to authenticated
  using (private.owns_property(property_id) and private.current_user_role() = 'owner'::public.app_role)
  with check (private.owns_property(property_id) and status in ('contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status));
create policy "staff manage bookings" on public.bookings for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "review events visible to owner or staff" on public.property_review_events for select to authenticated
  using (private.owns_property(property_id) or private.is_staff());
create policy "staff creates review events" on public.property_review_events for insert to authenticated
  with check (private.is_staff() and reviewer_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-images', 'property-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('property-media-staging', 'property-media-staging', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('verification-documents', 'verification-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "public read approved property images" on storage.objects for select
  using (bucket_id = 'property-images');
create policy "owners upload owned public image path" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text and private.current_user_role() = 'owner'::public.app_role);
create policy "owners stage media under own path" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media-staging' and (storage.foldername(name))[1] = auth.uid()::text and private.current_user_role() = 'owner'::public.app_role);
create policy "owners read staged media under own path" on storage.objects for select to authenticated
  using (bucket_id = 'property-media-staging' and ((storage.foldername(name))[1] = auth.uid()::text or private.is_staff()));
create policy "owners upload private evidence under own path" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text and private.current_user_role() = 'owner'::public.app_role);
create policy "owners or staff read private evidence" on storage.objects for select to authenticated
  using (bucket_id = 'verification-documents' and ((storage.foldername(name))[1] = auth.uid()::text or private.is_staff()));
create policy "staff manages storage objects" on storage.objects for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

commit;
