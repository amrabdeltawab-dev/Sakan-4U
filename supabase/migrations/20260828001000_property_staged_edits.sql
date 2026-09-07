begin;

alter table public.properties
  add column if not exists pending_edits jsonb not null default '{}'::jsonb,
  add column if not exists has_pending_updates boolean not null default false;

create index if not exists properties_pending_updates_idx
  on public.properties (updated_at desc)
  where deleted_at is null and has_pending_updates;

alter table public.property_lifecycle_audit
  drop constraint if exists property_lifecycle_audit_action_check;
alter table public.property_lifecycle_audit
  add constraint property_lifecycle_audit_action_check check (action in (
    'created', 'edited', 'submitted', 'resubmitted', 'approved', 'needs_changes', 'rejected',
    'hidden', 'unhidden', 'availability_changed', 'archived', 'deleted', 'media_added',
    'media_removed', 'media_replaced', 'media_reordered', 'media_edited',
    'updates_staged', 'updates_approved', 'updates_rejected'
  ));

create or replace function private.validate_staged_property_edits(proposed_edits jsonb, property_row public.properties)
returns void language plpgsql security definer set search_path = '' as $$
declare
  next_rent_type text;
  next_capacity integer;
  next_total_beds integer;
  candidate_key text;
begin
  if jsonb_typeof(proposed_edits) <> 'object' or proposed_edits = '{}'::jsonb then
    raise exception 'أدخل تعديلاً واحداً على الأقل قبل إرساله للمراجعة.' using errcode = '22023';
  end if;

  for candidate_key in select jsonb_object_keys(proposed_edits) loop
    if candidate_key not in ('title', 'property_type', 'governorate', 'city', 'area', 'street', 'approximate_location', 'description', 'monthly_price', 'bedrooms', 'bathrooms', 'capacity', 'rent_type', 'total_beds', 'gender_suitability', 'furnished', 'amenities', 'exact_lat', 'exact_lng') then
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
  if proposed_edits ? 'gender_suitability' and proposed_edits->>'gender_suitability' not in ('male', 'female', 'mixed') then raise exception 'ملاءمة السكن غير صحيحة.' using errcode = '22023'; end if;
  if proposed_edits ? 'property_type' and proposed_edits->>'property_type' not in ('apartment', 'studio', 'room', 'shared_room') then raise exception 'نوع العقار غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'exact_lat' and (jsonb_typeof(proposed_edits->'exact_lat') <> 'number' or (proposed_edits->>'exact_lat')::numeric not between -90 and 90) then raise exception 'إحداثي خط العرض غير صحيح.' using errcode = '22023'; end if;
  if proposed_edits ? 'exact_lng' and (jsonb_typeof(proposed_edits->'exact_lng') <> 'number' or (proposed_edits->>'exact_lng')::numeric not between -180 and 180) then raise exception 'إحداثي خط الطول غير صحيح.' using errcode = '22023'; end if;

  next_rent_type := coalesce(proposed_edits->>'rent_type', property_row.rent_type::text);
  next_capacity := coalesce((proposed_edits->>'capacity')::integer, property_row.capacity);
  next_total_beds := case when proposed_edits ? 'total_beds' then nullif(proposed_edits->>'total_beds', '')::integer else property_row.total_beds end;
  if next_rent_type = 'bed' and (next_total_beds is null or next_total_beds < 1 or next_total_beds > next_capacity) then raise exception 'أدخل عدد الأسرة المتاحة، ويجب ألا يزيد عن سعة العقار.' using errcode = '22023'; end if;
  if next_rent_type = 'full' and next_total_beds is not null then raise exception 'عدد الأسرة المتاحة يخص التأجير بالسرير فقط.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.owner_stage_property_edits(target_property_id uuid, proposed_edits jsonb)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية تعديله.' using errcode = '42501'; end if;
  if property_row.verification_status <> 'verified'::public.verification_status then raise exception 'يُعدَّل هذا العقار عبر مسار المراجعة الحالي قبل اعتماده.' using errcode = 'P0002'; end if;
  perform private.validate_staged_property_edits(proposed_edits, property_row);
  perform set_config('app.property_lifecycle_operation', 'staged_edits_submission', true);
  update public.properties
    set pending_edits = property_row.pending_edits || proposed_edits,
        has_pending_updates = true,
        review_reason = null
    where id = property_row.id
    returning * into property_row;
  insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, details)
    values (property_row.id, property_row.owner_id, auth.uid(), 'updates_staged', jsonb_build_object('fields', (select jsonb_agg(key) from jsonb_object_keys(proposed_edits) as key)));
  return property_row;
end;
$$;

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
      gender_suitability = case when edits ? 'gender_suitability' then (edits->>'gender_suitability')::public.gender_suitability else property_row.gender_suitability end,
      furnished = case when edits ? 'furnished' then (edits->>'furnished')::boolean else property_row.furnished end,
      amenities = case when edits ? 'amenities' then edits->'amenities' else property_row.amenities end,
      exact_lat = case when edits ? 'exact_lat' then (edits->>'exact_lat')::numeric else property_row.exact_lat end,
      exact_lng = case when edits ? 'exact_lng' then (edits->>'exact_lng')::numeric else property_row.exact_lng end,
      pending_edits = '{}'::jsonb,
      has_pending_updates = false,
      review_reason = null,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = property_row.id
    returning * into property_row;
  else
    if nullif(trim(coalesce(decision_reason, '')), '') is null then raise exception 'اكتب سبب رفض التعديلات ليظهر للمالك.' using errcode = '22023'; end if;
    perform set_config('app.property_lifecycle_operation', 'staged_edits_rejection', true);
    update public.properties set pending_edits = '{}'::jsonb, has_pending_updates = false, review_reason = trim(decision_reason), reviewed_by = auth.uid(), reviewed_at = now() where id = property_row.id returning * into property_row;
  end if;
  return property_row;
end;
$$;

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.deleted_at is distinct from new.deleted_at and current_setting('app.property_lifecycle_operation', true) <> 'property_archive' then raise exception 'أرشف العقار من خلال العملية المحمية.' using errcode = '42501'; end if;
    if (old.pending_edits is distinct from new.pending_edits or old.has_pending_updates is distinct from new.has_pending_updates)
      and current_setting('app.property_lifecycle_operation', true) <> 'staged_edits_submission' then raise exception 'أرسل تعديلات الإعلان عبر عملية المراجعة المحمية.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status and current_setting('app.property_lifecycle_operation', true) not in ('owner_availability', 'booking_reservation', 'property_archive', 'bed_inventory_confirmation', 'bed_inventory_release') then raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501'; end if;
    if old.verification_status is distinct from new.verification_status and not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.property_lifecycle_audit_property_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_action text; safe_details jsonb; lifecycle_operation text;
begin
  if tg_op = 'INSERT' then
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, to_verification_status, to_availability_status, details) values (new.id, new.owner_id, auth.uid(), 'created', new.verification_status::text, new.availability_status::text, jsonb_build_object('initialState', new.verification_status::text));
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, from_verification_status, from_availability_status, details) values (old.id, old.owner_id, auth.uid(), 'deleted', old.verification_status::text, old.availability_status::text, jsonb_build_object('title', old.title));
    return old;
  end if;
  lifecycle_operation := current_setting('app.property_lifecycle_operation', true);
  event_action := null;
  if old.deleted_at is null and new.deleted_at is not null then event_action := 'archived';
  elsif lifecycle_operation = 'staged_edits_approval' then event_action := 'updates_approved';
  elsif lifecycle_operation = 'staged_edits_rejection' then event_action := 'updates_rejected';
  elsif old.verification_status is distinct from new.verification_status then
    if new.verification_status = 'verified'::public.verification_status then event_action := 'approved';
    elsif new.verification_status = 'rejected'::public.verification_status then event_action := 'rejected';
    elsif new.verification_status = 'needs_changes'::public.verification_status then event_action := 'needs_changes';
    elsif new.verification_status = 'pending'::public.verification_status and old.verification_status = 'draft'::public.verification_status then event_action := 'submitted';
    elsif new.verification_status = 'pending'::public.verification_status and old.verification_status in ('rejected'::public.verification_status, 'needs_changes'::public.verification_status) then event_action := 'resubmitted';
    else event_action := 'edited'; end if;
  elsif old.availability_status is distinct from new.availability_status then
    if new.availability_status = 'hidden'::public.availability_status then event_action := 'hidden';
    elsif old.availability_status = 'hidden'::public.availability_status then event_action := 'unhidden';
    else event_action := 'availability_changed'; end if;
  elsif row(old.title, old.property_type, old.governorate, old.city, old.area, old.street, old.approximate_location, old.description, old.monthly_price, old.bedrooms, old.bathrooms, old.capacity, old.gender_suitability, old.furnished, old.amenities) is distinct from row(new.title, new.property_type, new.governorate, new.city, new.area, new.street, new.approximate_location, new.description, new.monthly_price, new.bedrooms, new.bathrooms, new.capacity, new.gender_suitability, new.furnished, new.amenities) then event_action := 'edited'; end if;
  if event_action is not null then
    safe_details := jsonb_build_object('title', new.title);
    if event_action = 'archived' then safe_details := safe_details || jsonb_build_object('archivedAt', new.deleted_at); end if;
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, from_verification_status, to_verification_status, from_availability_status, to_availability_status, details) values (new.id, new.owner_id, auth.uid(), event_action, old.verification_status::text, new.verification_status::text, old.availability_status::text, new.availability_status::text, safe_details);
  end if;
  return new;
end;
$$;

revoke all on function private.validate_staged_property_edits(jsonb, public.properties), private.enforce_owner_property_lifecycle(), private.property_lifecycle_audit_property_change() from public, anon, authenticated;
revoke all on function public.owner_stage_property_edits(uuid, jsonb), public.staff_review_staged_property_edits(uuid, boolean, text) from public, anon;
grant execute on function public.owner_stage_property_edits(uuid, jsonb), public.staff_review_staged_property_edits(uuid, boolean, text) to authenticated;

commit;
