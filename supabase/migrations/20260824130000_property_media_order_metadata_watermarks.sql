alter table public.property_media
  add column if not exists sort_order integer not null default 0 check (sort_order >= 0),
  add column if not exists description text check (description is null or char_length(trim(description)) between 1 and 160),
  add column if not exists tag text check (tag is null or char_length(trim(tag)) between 1 and 48),
  add column if not exists public_storage_bucket text check (public_storage_bucket is null or public_storage_bucket = 'property-images'),
  add column if not exists public_storage_path text unique,
  add column if not exists public_mime_type text check (public_mime_type is null or public_mime_type ~ '^image/'),
  add column if not exists watermark_status text not null default 'not_requested' check (watermark_status in ('not_requested', 'processing', 'watermarked', 'failed', 'legacy_pending')),
  add column if not exists watermark_error text check (watermark_error is null or char_length(watermark_error) <= 500),
  add column if not exists watermark_processed_at timestamptz;

with ordered_media as (
  select id, row_number() over (partition by property_id order by is_primary desc, created_at asc, id asc) - 1 as next_order
  from public.property_media
  where media_type = 'image'::public.media_type
)
update public.property_media media
set sort_order = ordered_media.next_order
from ordered_media
where media.id = ordered_media.id;

update public.property_media
set watermark_status = 'legacy_pending'
where media_type = 'image'::public.media_type
  and is_public = true
  and storage_bucket = 'property-images'
  and public_storage_path is null;

drop index if exists public.property_media_unique_order_per_property_idx;

create index if not exists property_media_watermark_status_idx
  on public.property_media (property_id, watermark_status)
  where media_type = 'image'::public.media_type;

-- Browser clients use the audited server projections rather than direct table reads,
-- preventing private original object paths from leaking alongside public derivatives.
revoke all on table public.property_media from anon, authenticated;

commit;
