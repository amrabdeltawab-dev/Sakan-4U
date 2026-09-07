do $$ begin
  create type public.rent_type as enum ('full', 'bed');
exception when duplicate_object then null; end $$;

alter table public.properties
  add column if not exists rent_type public.rent_type;

update public.properties
set rent_type = 'full'::public.rent_type
where rent_type is null;

alter table public.properties
  alter column rent_type set default 'full'::public.rent_type,
  alter column rent_type set not null,
  add column if not exists total_beds smallint;

alter table public.properties
  drop constraint if exists properties_rent_type_total_beds_check,
  add constraint properties_rent_type_total_beds_check check (
    (rent_type = 'full'::public.rent_type and total_beds is null)
    or (rent_type = 'bed'::public.rent_type and total_beds between 1 and capacity)
  );

create index if not exists properties_public_rent_type_idx
  on public.properties (rent_type)
  where deleted_at is null and verification_status = 'verified'::public.verification_status;
