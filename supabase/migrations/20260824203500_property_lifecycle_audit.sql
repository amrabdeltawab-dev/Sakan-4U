begin;

create table if not exists public.property_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  owner_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('created', 'edited', 'submitted', 'resubmitted', 'approved', 'needs_changes', 'rejected', 'hidden', 'unhidden', 'availability_changed', 'deleted', 'media_added', 'media_removed', 'media_replaced', 'media_reordered', 'media_edited')),
  from_verification_status text,
  to_verification_status text,
  from_availability_status text,
  to_availability_status text,
  media_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_lifecycle_audit_property_idx on public.property_lifecycle_audit(property_id, created_at desc);
create index if not exists property_lifecycle_audit_owner_idx on public.property_lifecycle_audit(owner_id, created_at desc);

alter table public.property_lifecycle_audit enable row level security;
create policy "owners and staff read property lifecycle audit" on public.property_lifecycle_audit for select to authenticated
  using (owner_id = auth.uid() or private.is_staff());
revoke all on public.property_lifecycle_audit from public, anon, authenticated;
grant select on public.property_lifecycle_audit to authenticated;
grant all on public.property_lifecycle_audit to service_role;

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
  if old.verification_status is distinct from new.verification_status then
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
    insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, from_verification_status, to_verification_status, from_availability_status, to_availability_status, details)
      values (new.id, new.owner_id, auth.uid(), event_action, old.verification_status::text, new.verification_status::text, old.availability_status::text, new.availability_status::text, safe_details);
  end if;
  return new;
end;
$$;

drop trigger if exists property_lifecycle_audit_properties on public.properties;
create trigger property_lifecycle_audit_properties
  after insert or update or delete on public.properties
  for each row execute procedure private.property_lifecycle_audit_property_change();

create or replace function private.property_lifecycle_audit_media_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; event_action text; target_media public.property_media%rowtype;
begin
  target_media := case when tg_op = 'DELETE' then old else new end;
  select * into property_row from public.properties where id = target_media.property_id;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then event_action := 'media_added';
  elsif tg_op = 'DELETE' then event_action := 'media_removed';
  elsif old.sort_order is distinct from new.sort_order or old.is_primary is distinct from new.is_primary then event_action := 'media_reordered';
  elsif old.storage_path is distinct from new.storage_path then event_action := 'media_replaced';
  elsif old.description is distinct from new.description or old.tag is distinct from new.tag then event_action := 'media_edited';
  else return new; end if;
  insert into public.property_lifecycle_audit(property_id, owner_id, actor_id, action, media_id, details)
    values (property_row.id, property_row.owner_id, auth.uid(), event_action, target_media.id, jsonb_build_object('mediaType', target_media.media_type::text, 'sortOrder', target_media.sort_order, 'tag', target_media.tag, 'isPrimary', target_media.is_primary));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists property_lifecycle_audit_media on public.property_media;
create trigger property_lifecycle_audit_media
  after insert or update or delete on public.property_media
  for each row execute procedure private.property_lifecycle_audit_media_change();

create or replace function public.owner_submit_property_for_review(target_property_id uuid)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; photo_total integer;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  if property_row.verification_status not in ('draft'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status) then raise exception 'لا يمكن إرسال هذا العقار للمراجعة في حالته الحالية.' using errcode = 'P0002'; end if;
  select count(*) into photo_total from public.property_media where property_id = property_row.id and media_type = 'image'::public.media_type;
  if photo_total < 3 then raise exception 'يلزم رفع 3 صور واضحة على الأقل قبل إرسال العقار للمراجعة.' using errcode = 'P0002'; end if;
  update public.properties set verification_status = 'pending'::public.verification_status, review_reason = null where id = property_row.id returning * into property_row;
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
  return jsonb_build_object('propertyId', property_row.id, 'canDelete', booking_total = 0 and financial_total = 0 and review_total = 0, 'bookingCount', booking_total, 'financialRecordCount', financial_total, 'reviewEventCount', review_total, 'message', case when booking_total > 0 or financial_total > 0 then 'لا يمكن حذف العقار لأنه مرتبط بطلبات معاينة أو سجلات مالية يجب الاحتفاظ بها.' when review_total > 0 then 'لا يمكن حذف العقار لأن له سجل مراجعة تشغيلي يجب الاحتفاظ به.' else 'يمكن حذف العقار بأمان.' end);
end;
$$;

create or replace function public.super_admin_property_deletion_eligibility(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.staff_property_deletion_summary(target_property_id); end;
$$;

create or replace function public.super_admin_delete_property_safely(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare summary jsonb; property_row public.properties%rowtype; media_objects jsonb;
begin
  summary := private.staff_property_deletion_summary(target_property_id);
  if not coalesce((summary ->> 'canDelete')::boolean, false) then raise exception '%', summary ->> 'message' using errcode = 'P0002'; end if;
  select * into property_row from public.properties where id = target_property_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('storageBucket', m.storage_bucket, 'storagePath', m.storage_path, 'publicStorageBucket', m.public_storage_bucket, 'publicStoragePath', m.public_storage_path)), '[]'::jsonb) into media_objects from public.property_media m where m.property_id = property_row.id;
  delete from public.properties where id = property_row.id;
  return jsonb_build_object('propertyId', property_row.id, 'deleted', true, 'mediaObjects', media_objects);
end;
$$;

revoke all on function private.property_lifecycle_audit_property_change(), private.property_lifecycle_audit_media_change(), private.staff_property_deletion_summary(uuid) from public, anon, authenticated;
revoke all on function public.owner_submit_property_for_review(uuid), public.super_admin_property_deletion_eligibility(uuid), public.super_admin_delete_property_safely(uuid) from public, anon;
grant execute on function public.owner_submit_property_for_review(uuid), public.super_admin_property_deletion_eligibility(uuid), public.super_admin_delete_property_safely(uuid) to authenticated;

commit;
