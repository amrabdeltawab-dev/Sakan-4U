begin;

alter table public.properties
  add column if not exists deleted_at timestamptz;

create index if not exists properties_active_discovery_idx
  on public.properties (verification_status, availability_status, governorate, city, area)
  where deleted_at is null;

drop policy if exists "public read verified available or reserved properties" on public.properties;
create policy "public read verified available or reserved properties" on public.properties for select
  using (
    auth.uid() is null
    and deleted_at is null
    and verification_status = 'verified'::public.verification_status
    and availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
  );

alter table public.property_lifecycle_audit
  drop constraint if exists property_lifecycle_audit_action_check;
alter table public.property_lifecycle_audit
  add constraint property_lifecycle_audit_action_check check (action in ('created', 'edited', 'submitted', 'resubmitted', 'approved', 'needs_changes', 'rejected', 'hidden', 'unhidden', 'availability_changed', 'archived', 'deleted', 'media_added', 'media_removed', 'media_replaced', 'media_reordered', 'media_edited'));

create or replace function private.property_lifecycle_audit_property_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_action text; safe_details jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, to_verification_status, to_availability_status, details)
      values (new.id, new.owner_id, auth.uid(), 'created', new.verification_status::text, new.availability_status::text, jsonb_build_object('initialState', new.verification_status::text));
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, from_verification_status, from_availability_status, details)
      values (old.id, old.owner_id, auth.uid(), 'deleted', old.verification_status::text, old.availability_status::text, jsonb_build_object('title', old.title));
    return old;
  end if;

  event_action := null;
  if old.deleted_at is null and new.deleted_at is not null then
    event_action := 'archived';
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
  elsif row(old.title, old.property_type, old.governorate, old.city, old.area, old.street, old.approximate_location, old.description, old.monthly_price, old.bedrooms, old.bathrooms, old.capacity, old.gender_suitability, old.furnished, old.amenities) is distinct from row(new.title, new.property_type, new.governorate, new.city, new.area, new.street, new.approximate_location, new.description, new.monthly_price, new.bedrooms, new.bathrooms, new.capacity, new.gender_suitability, new.furnished, new.amenities) then
    event_action := 'edited';
  end if;
  if event_action is not null then
    safe_details := jsonb_build_object('title', new.title);
    if event_action = 'archived' then safe_details := safe_details || jsonb_build_object('archivedAt', new.deleted_at); end if;
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, from_verification_status, to_verification_status, from_availability_status, to_availability_status, details)
      values (new.id, new.owner_id, auth.uid(), event_action, old.verification_status::text, new.verification_status::text, old.availability_status::text, new.availability_status::text, safe_details);
  end if;
  return new;
end;
$$;

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.deleted_at is distinct from new.deleted_at and current_setting('app.property_lifecycle_operation', true) <> 'property_archive' then
      raise exception 'أرشف العقار من خلال العملية المحمية.' using errcode = '42501';
    end if;
    if old.availability_status is distinct from new.availability_status
      and current_setting('app.property_lifecycle_operation', true) not in ('owner_availability', 'booking_reservation', 'property_archive') then
      raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501';
    end if;
    if old.verification_status is distinct from new.verification_status and not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then
      raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.is_favoritable_property(target_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties p
    where p.id = target_property_id
      and p.deleted_at is null
      and p.verification_status = 'verified'::public.verification_status
      and p.availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
  )
$$;

create or replace function private.owner_property_deletion_summary(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; booking_total integer; financial_total integer; review_total integer;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  select count(*) into booking_total from public.bookings where property_id = property_row.id;
  select count(*) into financial_total from public.booking_financials f join public.bookings b on b.id = f.booking_id where b.property_id = property_row.id;
  select count(*) into review_total from public.property_review_events where property_id = property_row.id;
  return jsonb_build_object('propertyId', property_row.id, 'canArchive', property_row.deleted_at is null, 'canDelete', property_row.deleted_at is null, 'bookingCount', booking_total, 'financialRecordCount', financial_total, 'reviewEventCount', review_total, 'message', case when property_row.deleted_at is not null then 'هذا العقار مؤرشف بالفعل ولا يظهر للطلاب أو طابور المراجعة.' else 'ستتم أرشفة العقار وإخفاؤه من النتائج مع الاحتفاظ بطلبات المعاينة والسجل التشغيلي المرتبط به.' end);
end;
$$;

create or replace function public.owner_delete_property_safely(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare summary jsonb; property_row public.properties%rowtype;
begin
  summary := private.owner_property_deletion_summary(target_property_id);
  if not coalesce((summary ->> 'canArchive')::boolean, false) then raise exception '%', summary ->> 'message' using errcode = 'P0002'; end if;
  perform set_config('app.property_lifecycle_operation', 'property_archive', true);
  update public.properties set deleted_at = now(), availability_status = 'hidden'::public.availability_status
    where id = target_property_id and owner_id = auth.uid() and deleted_at is null returning * into property_row;
  if not found then raise exception 'تعذر أرشفة العقار بأمان. حاول مرة أخرى.' using errcode = 'P0002'; end if;
  return jsonb_build_object('propertyId', property_row.id, 'archived', true, 'deletedAt', property_row.deleted_at);
end;
$$;

create or replace function public.owner_set_property_availability(target_property_id uuid, target_availability public.availability_status)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'العقار غير موجود أو مؤرشف أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  if target_availability = 'available'::public.availability_status and property_row.verification_status <> 'verified'::public.verification_status then raise exception 'لا يمكن إظهار العقار للطلاب قبل اعتماده من الإدارة.' using errcode = '42501'; end if;
  perform set_config('app.property_lifecycle_operation', 'owner_availability', true);
  update public.properties set availability_status = target_availability where id = property_row.id returning * into property_row;
  return property_row;
end;
$$;

create or replace function private.staff_property_deletion_summary(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; booking_total integer; financial_total integer; review_total integer;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'super_admin'::public.app_role then raise exception 'هذه العملية مخصصة للمدير العام.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  select count(*) into booking_total from public.bookings where property_id = property_row.id;
  select count(*) into financial_total from public.booking_financials f join public.bookings b on b.id = f.booking_id where b.property_id = property_row.id;
  select count(*) into review_total from public.property_review_events where property_id = property_row.id;
  return jsonb_build_object('propertyId', property_row.id, 'canArchive', property_row.deleted_at is null, 'canDelete', property_row.deleted_at is null, 'bookingCount', booking_total, 'financialRecordCount', financial_total, 'reviewEventCount', review_total, 'message', case when property_row.deleted_at is not null then 'هذا العقار مؤرشف بالفعل.' else 'ستتم أرشفة العقار وإخفاؤه مع الاحتفاظ بالسجلات والارتباطات التاريخية.' end);
end;
$$;

create or replace function public.super_admin_delete_property_safely(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare summary jsonb; property_row public.properties%rowtype;
begin
  summary := private.staff_property_deletion_summary(target_property_id);
  if not coalesce((summary ->> 'canArchive')::boolean, false) then raise exception '%', summary ->> 'message' using errcode = 'P0002'; end if;
  perform set_config('app.property_lifecycle_operation', 'property_archive', true);
  update public.properties set deleted_at = now(), availability_status = 'hidden'::public.availability_status
    where id = target_property_id and deleted_at is null returning * into property_row;
  if not found then raise exception 'تعذر أرشفة العقار بأمان. حاول مرة أخرى.' using errcode = 'P0002'; end if;
  return jsonb_build_object('propertyId', property_row.id, 'archived', true, 'deletedAt', property_row.deleted_at);
end;
$$;

create or replace function public.quote_viewing_fee(target_property_id uuid)
returns table(fee_amount integer, capacity smallint) language plpgsql security definer set search_path = '' as $$
begin
  return query
  select rule.fee_amount, property.capacity
  from public.properties property join public.viewing_fee_rules rule on property.capacity >= rule.min_capacity and (rule.max_capacity is null or property.capacity <= rule.max_capacity)
  where property.id = target_property_id and property.deleted_at is null and property.verification_status = 'verified'::public.verification_status and property.availability_status = 'available'::public.availability_status;
  if not found then raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار. يرجى المحاولة لاحقاً أو التواصل مع فريق ساكينو.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.create_viewing_request(target_property_id uuid, target_requested_viewing_at timestamptz, target_contact_name text, target_phone text, target_people_count smallint, target_notes text default null)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare property_record public.properties%rowtype; configured_fee integer; created_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then raise exception 'Only the authenticated student may create a viewing request' using errcode = '42501'; end if;
  if target_requested_viewing_at < now() then raise exception 'The requested viewing time must be in the future' using errcode = '22007'; end if;
  select * into property_record from public.properties where id = target_property_id and deleted_at is null and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status;
  if not found then raise exception 'The requested property is not available for viewing' using errcode = 'P0002'; end if;
  if property_record.owner_id = auth.uid() then raise exception 'A student cannot request a viewing for their own property' using errcode = '42501'; end if;
  select fee_amount into configured_fee from public.viewing_fee_rules where property_record.capacity >= min_capacity and (max_capacity is null or property_record.capacity <= max_capacity);
  if not found then raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار حالياً.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookings where property_id = target_property_id and student_id = auth.uid() and status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)) then raise exception 'لديك بالفعل طلب معاينة نشط لهذا العقار.' using errcode = '23505'; end if;
  perform set_config('app.sakeno_booking_operation', 'create_viewing_request', true);
  insert into public.bookings (property_id, student_id, contact_name, phone, people_count, preferred_contact_time, notes, status, requested_viewing_at, fee_amount, payment_status)
    values (target_property_id, auth.uid(), target_contact_name, target_phone, target_people_count, 'any', target_notes, 'pending'::public.booking_status, target_requested_viewing_at, configured_fee, 'pending'::public.viewing_payment_status)
    returning * into created_booking;
  insert into public.booking_financials (booking_id, inspection_fee_amount) values (created_booking.id, configured_fee);
  return created_booking;
end;
$$;

commit;
