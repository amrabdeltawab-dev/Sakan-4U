begin;

grant select on public.properties to authenticated;
revoke select on public.properties from anon;
grant select (
  id,
  title,
  property_type,
  governorate,
  city,
  area,
  approximate_location,
  description,
  monthly_price,
  bedrooms,
  bathrooms,
  capacity,
  gender_suitability,
  furnished,
  amenities,
  verification_status,
  availability_status,
  owner_identity_verified,
  property_video_verified,
  location_verified,
  availability_verified,
  review_reason,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
) on public.properties to anon;

drop policy if exists "public read verified available properties" on public.properties;
create policy "public read verified available properties" on public.properties for select
  using (
    auth.uid() is null
    and verification_status = 'verified'::public.verification_status
    and availability_status = 'available'::public.availability_status
  );

commit;
