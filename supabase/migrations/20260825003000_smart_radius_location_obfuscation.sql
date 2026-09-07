begin;

alter table public.properties
  add column if not exists exact_lat numeric(10,7),
  add column if not exists exact_lng numeric(10,7),
  add column if not exists public_lat numeric(10,7),
  add column if not exists public_lng numeric(10,7);

alter table public.properties
  drop constraint if exists properties_exact_location_pair_check,
  add constraint properties_exact_location_pair_check check ((exact_lat is null) = (exact_lng is null)),
  drop constraint if exists properties_exact_latitude_range_check,
  add constraint properties_exact_latitude_range_check check (exact_lat is null or exact_lat between -90 and 90),
  drop constraint if exists properties_exact_longitude_range_check,
  add constraint properties_exact_longitude_range_check check (exact_lng is null or exact_lng between -180 and 180),
  drop constraint if exists properties_public_location_pair_check,
  add constraint properties_public_location_pair_check check ((public_lat is null) = (public_lng is null)),
  drop constraint if exists properties_public_latitude_range_check,
  add constraint properties_public_latitude_range_check check (public_lat is null or public_lat between -90 and 90),
  drop constraint if exists properties_public_longitude_range_check,
  add constraint properties_public_longitude_range_check check (public_lng is null or public_lng between -180 and 180);

-- Preserve the legacy protected coordinates as the initial exact source. The
-- trigger below computes a separate public point once for every legacy row.
update public.properties
set exact_lat = latitude, exact_lng = longitude
where exact_lat is null and exact_lng is null and latitude is not null and longitude is not null;

create or replace function private.apply_smart_radius_location_obfuscation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  offset_meters numeric;
  bearing_radians numeric;
  latitude_delta numeric;
  longitude_delta numeric;
begin
  if new.exact_lat is null and new.exact_lng is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.exact_lat is distinct from new.exact_lat
     or old.exact_lng is distinct from new.exact_lng
     or new.public_lat is null
     or new.public_lng is null then
    -- A fresh cryptographically seeded database random draw is persisted only
    -- at write time. Reads never recalculate this point.
    offset_meters := 200 + random() * 100;
    bearing_radians := random() * 2 * pi();
    latitude_delta := (offset_meters * cos(bearing_radians)) / 111320;
    longitude_delta := (offset_meters * sin(bearing_radians)) / (111320 * greatest(abs(cos(radians(new.exact_lat))), 0.01));
    new.public_lat := round((new.exact_lat + latitude_delta)::numeric, 7);
    new.public_lng := round((new.exact_lng + longitude_delta)::numeric, 7);
  end if;
  return new;
end;
$$;

drop trigger if exists properties_apply_smart_radius_location_obfuscation on public.properties;
create trigger properties_apply_smart_radius_location_obfuscation
before insert or update of exact_lat, exact_lng on public.properties
for each row execute procedure private.apply_smart_radius_location_obfuscation();

-- Cause the trigger to materialize a fixed public point for migrated rows.
update public.properties
set exact_lat = exact_lat
where exact_lat is not null and public_lat is null and public_lng is null;

-- Authenticated exact-coordinate access remains constrained by the existing
-- row-level policies: owners see only their own listings and staff see only
-- their authorized review scope. Student/public API projections are separately
-- curated in the server and never include these columns.
grant select on public.properties to authenticated;
revoke insert, update, delete on public.properties from anon;
revoke select (latitude, longitude, exact_lat, exact_lng, street) on public.properties from anon;
grant select (
  id, title, property_type, governorate, city, area, approximate_location,
  public_lat, public_lng, description, monthly_price, bedrooms, bathrooms, capacity,
  gender_suitability, furnished, amenities, verification_status, availability_status,
  owner_identity_verified, property_video_verified, location_verified,
  availability_verified, review_reason, reviewed_by, reviewed_at, created_at, updated_at
) on public.properties to anon;

revoke all on function private.apply_smart_radius_location_obfuscation() from public, anon, authenticated;

commit;
