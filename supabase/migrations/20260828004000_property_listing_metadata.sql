begin;

do $$ begin
  create type public.gender_preference as enum ('male', 'female', 'anyone');
exception when duplicate_object then null; end $$;

alter table public.properties
  add column if not exists distance_to_campus text,
  add column if not exists utilities_included jsonb not null default '[]'::jsonb,
  add column if not exists video_url text,
  add column if not exists gender_preference public.gender_preference not null default 'anyone'::public.gender_preference;

-- Preserve the observed legacy bed listing by assigning it to the confirmed audience.
update public.properties
set gender_preference = 'male'::public.gender_preference
where rent_type = 'bed'::public.rent_type
  and gender_preference = 'anyone'::public.gender_preference
  and gender_suitability = 'mixed'::public.gender_suitability;

alter table public.properties
  drop constraint if exists properties_gender_preference_check,
  drop constraint if exists properties_utilities_included_check,
  drop constraint if exists properties_video_url_check;

alter table public.properties
  add constraint properties_gender_preference_check check (
    (rent_type = 'bed'::public.rent_type and gender_preference in ('male'::public.gender_preference, 'female'::public.gender_preference))
    or (rent_type = 'full'::public.rent_type and gender_preference in ('male'::public.gender_preference, 'female'::public.gender_preference, 'anyone'::public.gender_preference))
  ),
  add constraint properties_utilities_included_check check (jsonb_typeof(utilities_included) = 'array'),
  add constraint properties_video_url_check check (video_url is null or char_length(trim(video_url)) between 1 and 500);

create index if not exists properties_gender_preference_idx on public.properties (rent_type, gender_preference);

-- Extend the secure staged-edit validator without weakening its allow-list.
create or replace function private.validate_staged_property_edits(proposed_edits jsonb, property_row public.properties)
returns void language plpgsql security definer set search_path = '' as $$
declare
  next_rent_type text;
  next_capacity integer;
  next_total_beds integer;
  next_gender_preference text;
  candidate_key text;
begin
  if jsonb_typeof(proposed_edits) <> 'object' or proposed_edits = '{}'::jsonb then
    raise exception 'أدخل تعديلاً واحداً على الأقل قبل إرساله للمراجعة.' using errcode = '22023';
  end if;
  for candidate_key in select jsonb_object_keys(proposed_edits) loop
    if candidate_key not in ('title', 'property_type', 'governorate', 'city', 'area', 'street', 'approximate_location', 'description', 'monthly_price', 'bedrooms', 'bathrooms', 'capacity', 'rent_type', 'total_beds', 'gender_preference', 'gender_suitability', 'furnished', 'amenities', 'exact_lat', 'exact_lng', 'distance_to_campus', 'utilities_included', 'video_url') then
      raise exception 'يتضمن التعديل حقلاً غير مسموح به.' using errcode = '42501';
    end if;
  end loop;
  if proposed_edits ? 'title' and (jsonb_typeof(proposed_edits->'title') <> 'string' or char_length(trim(proposed_edits->>'title')) not between 4 and 180) then raise exception 'عنوان العقار يجب أن يتكون من 4 إلى 180 حرفاً.' using errcode = '22023'; end if;
  if proposed_edits ? 'description' and (jsonb_typeof(proposed_edits->'description') <> 'string' or char_length(trim(proposed_edits->>'description')) < 20) then raise exception 'وصف العقار مطلوب ويجب أن يحتوي على 20 حرفاً واضحاً على الأقل بعد تجاهل المسافات.' using errcode = '22023'; end if;
  if proposed_edits ? 'monthly_price' and (jsonb_typeof(proposed_edits->'monthly_price') <> 'number' or (proposed_edits->>'monthly_price')::numeric <= 0 or (proposed_edits->>'monthly_price') !~ '^\d+$') then raise exception 'أدخل سعراً شهرياً صحيحاً أكبر من صفر.' using errcode = '22023'; end if;
  if proposed_edits ? 'bedrooms' and (jsonb_typeof(proposed_edits->'bedrooms') <> 'number' or (proposed_edits->>'bedrooms') !~ '^\d+$' or (proposed_edits->>'bedrooms')::integer < 1) then raise exception 'أدخل عدد الغرف بشكل صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'bathrooms' and (jsonb_typeof(proposed_edits->'bathrooms') <> 'number' or (proposed_edits->>'bathrooms') !~ '^\d+$' or (proposed_edits->>'bathrooms')::integer < 1) then raise exception 'أدخل عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.' using errcode = '22023'; end if;
  if proposed_edits ? 'capacity' and (jsonb_typeof(proposed_edits->'capacity') <> 'number' or (proposed_edits->>'capacity') !~ '^\d+$' or (proposed_edits->>'capacity')::integer < 1) then raise exception 'أدخل سعة العقار بشكل صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'amenities' and (jsonb_typeof(proposed_edits->'amenities') <> 'array' or jsonb_array_length(proposed_edits->'amenities') < 1) then raise exception 'اختر تجهيزاً واحداً على الأقل للعقار.' using errcode = '22023'; end if;
  if proposed_edits ? 'furnished' and jsonb_typeof(proposed_edits->'furnished') <> 'boolean' then raise exception 'قيمة التأثيث غير صحيحة.' using errcode = '22023'; end if;
  if proposed_edits ? 'rent_type' and proposed_edits->>'rent_type' not in ('full', 'bed') then raise exception 'نوع التأجير غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'gender_preference' and proposed_edits->>'gender_preference' not in ('male', 'female', 'anyone') then raise exception 'الفئة المناسبة للسكن غير صحيحة.' using errcode = '22023'; end if;
  if proposed_edits ? 'gender_suitability' and proposed_edits->>'gender_suitability' not in ('male', 'female', 'mixed') then raise exception 'ملاءمة السكن غير صحيحة.' using errcode = '22023'; end if;
  if proposed_edits ? 'property_type' and proposed_edits->>'property_type' not in ('apartment', 'studio', 'room', 'shared_room') then raise exception 'نوع العقار غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'exact_lat' and (jsonb_typeof(proposed_edits->'exact_lat') <> 'number' or (proposed_edits->>'exact_lat')::numeric not between -90 and 90) then raise exception 'إحداثي خط العرض غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'exact_lng' and (jsonb_typeof(proposed_edits->'exact_lng') <> 'number' or (proposed_edits->>'exact_lng')::numeric not between -180 and 180) then raise exception 'إحداثي خط الطول غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'utilities_included' and jsonb_typeof(proposed_edits->'utilities_included') <> 'array' then raise exception 'قائمة المرافق المشمولة غير صحيحة.' using errcode = '22023'; end if;
  if proposed_edits ? 'video_url' and jsonb_typeof(proposed_edits->'video_url') <> 'string' then raise exception 'رابط الفيديو غير صحيح.' using errcode = '22023'; end if;

  next_rent_type := coalesce(proposed_edits->>'rent_type', property_row.rent_type::text);
  next_capacity := coalesce((proposed_edits->>'capacity')::integer, property_row.capacity);
  next_total_beds := case when proposed_edits ? 'total_beds' then nullif(proposed_edits->>'total_beds', '')::integer else property_row.total_beds end;
  next_gender_preference := coalesce(proposed_edits->>'gender_preference', property_row.gender_preference::text, case when property_row.gender_suitability = 'mixed'::public.gender_suitability then 'anyone' else property_row.gender_suitability::text end);
  if next_rent_type = 'bed' and (next_total_beds is null or next_total_beds < 1 or next_total_beds > next_capacity) then raise exception 'أدخل عدد الأسرة المتاحة، ويجب ألا يزيد عن سعة العقار.' using errcode = '22023'; end if;
  if next_rent_type = 'bed' and next_gender_preference not in ('male', 'female') then raise exception 'اختر شباب أو طالبات لتأجير العقار بالسرير؛ لا يمكن اختيار مناسب للجميع.' using errcode = '22023'; end if;
  if next_rent_type = 'full' and next_total_beds is not null then raise exception 'عدد الأسرة المتاحة يخص التأجير بالسرير فقط.' using errcode = '22023'; end if;
end;
$$;

-- Keep the existing secure staff merge path authoritative for the added fields.
create or replace function public.staff_review_staged_property_edits(target_property_id uuid, approve boolean, decision_reason text default null)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; edits jsonb;
begin
  if auth.uid() is null or not private.is_staff() then raise exception 'هذه العملية مخصصة للإدارة.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and deleted_at is null for update;
  if not found or not property_row.has_pending_updates then raise exception 'لا توجد تعديلات معلقة لهذا العقار.' using errcode = 'P0002'; end if;
  edits := property_row.pending_edits;
  perform private.validate_staged_property_edits(edits, property_row);
  if approve then
    perform set_config('app.property_lifecycle_operation', 'staged_edits_approval', true);
    update public.properties set
      title = case when edits ? 'title' then trim(edits->>'title') else property_row.title end,
      property_type = case when edits ? 'property_type' then (edits->>'property_type')::public.property_type else property_row.property_type end,
      governorate = case when edits ? 'governorate' then trim(edits->>'governorate') else property_row.governorate end,
      city = case when edits ? 'city' then trim(edits->>'city') else property_row.city end,
      area = case when edits ? 'area' then trim(edits->>'area') else property_row.area end,
      street = case when edits ? 'street' then nullif(trim(edits->>'street'), '') else property_row.street end,
      approximate_location = case when edits ? 'approximate_location' then nullif(trim(edits->>'approximate_location'), '') else property_row.approximate_location end,
      description = case when edits ? 'description' then trim(edits->>'description') else property_row.description end,
      monthly_price = case when edits ? 'monthly_price' then (edits->>'monthly_price')::integer else property_row.monthly_price end,
      bedrooms = case when edits ? 'bedrooms' then (edits->>'bedrooms')::smallint else property_row.bedrooms end,
      bathrooms = case when edits ? 'bathrooms' then (edits->>'bathrooms')::smallint else property_row.bathrooms end,
      capacity = case when edits ? 'capacity' then (edits->>'capacity')::smallint else property_row.capacity end,
      rent_type = case when edits ? 'rent_type' then (edits->>'rent_type')::public.rent_type else property_row.rent_type end,
      total_beds = case when edits ? 'total_beds' then nullif(edits->>'total_beds', '')::smallint else property_row.total_beds end,
      gender_preference = case when edits ? 'gender_preference' then (edits->>'gender_preference')::public.gender_preference else property_row.gender_preference end,
      gender_suitability = case when edits ? 'gender_preference' then case when edits->>'gender_preference' = 'anyone' then 'mixed'::public.gender_suitability else (edits->>'gender_preference')::public.gender_suitability end else property_row.gender_suitability end,
      distance_to_campus = case when edits ? 'distance_to_campus' then nullif(trim(edits->>'distance_to_campus'), '') else property_row.distance_to_campus end,
      utilities_included = case when edits ? 'utilities_included' then edits->'utilities_included' else property_row.utilities_included end,
      video_url = case when edits ? 'video_url' then nullif(trim(edits->>'video_url'), '') else property_row.video_url end,
      furnished = case when edits ? 'furnished' then (edits->>'furnished')::boolean else property_row.furnished end,
      amenities = case when edits ? 'amenities' then edits->'amenities' else property_row.amenities end,
      exact_lat = case when edits ? 'exact_lat' then (edits->>'exact_lat')::numeric else property_row.exact_lat end,
      exact_lng = case when edits ? 'exact_lng' then (edits->>'exact_lng')::numeric else property_row.exact_lng end,
      pending_edits = '{}'::jsonb, has_pending_updates = false, review_reason = null, reviewed_by = auth.uid(), reviewed_at = now()
    where id = property_row.id returning * into property_row;
  else
    if nullif(trim(coalesce(decision_reason, '')), '') is null then raise exception 'اكتب سبب رفض التعديلات ليظهر للمالك.' using errcode = '22023'; end if;
    perform set_config('app.property_lifecycle_operation', 'staged_edits_rejection', true);
    update public.properties set pending_edits = '{}'::jsonb, has_pending_updates = false, review_reason = trim(decision_reason), reviewed_by = auth.uid(), reviewed_at = now() where id = property_row.id returning * into property_row;
  end if;
  return property_row;
end;
$$;

revoke all on type public.gender_preference from public;
grant usage on type public.gender_preference to anon, authenticated, service_role;

commit;
