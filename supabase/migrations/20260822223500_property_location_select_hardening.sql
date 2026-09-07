begin;

revoke select on public.properties from anon, authenticated;
grant select (
  id,
  title,
  property_type,
  governorate,
  city,
  area,
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
) on public.properties to anon, authenticated;

commit;
