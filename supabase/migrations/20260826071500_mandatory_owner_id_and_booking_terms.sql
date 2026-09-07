begin;

alter table public.property_media
  add column if not exists verification_document_kind text;

alter table public.property_media
  drop constraint if exists property_media_verification_document_kind_check;

alter table public.property_media
  add constraint property_media_verification_document_kind_check check (
    (media_type <> 'verification_document'::public.media_type and verification_document_kind is null)
    or (
      media_type = 'verification_document'::public.media_type
      and (
        verification_document_kind in ('national_id', 'ownership_evidence')
        or storage_bucket = 'verification-documents'
      )
    )
  );

create or replace function private.enforce_private_verification_document_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare property_owner_id uuid;
begin
  if new.media_type = 'verification_document'::public.media_type then
    if new.storage_bucket not in ('verification-documents', 'verification_documents')
       or new.is_public
       or new.public_storage_bucket is not null
       or new.public_storage_path is not null then
      raise exception 'Verification documents must remain private';
    end if;
    if new.storage_bucket = 'verification_documents'
       and new.verification_document_kind not in ('national_id', 'ownership_evidence') then
      raise exception 'A verification document kind is required';
    end if;
    select owner_id into property_owner_id from public.properties where id = new.property_id;
    if property_owner_id is null or split_part(new.storage_path, '/', 1) <> property_owner_id::text then
      raise exception 'Verification document path must belong to the property owner';
    end if;
  elsif new.storage_bucket = 'verification_documents' or new.verification_document_kind is not null then
    raise exception 'The verification_documents bucket accepts classified verification documents only';
  end if;
  return new;
end;
$$;

drop policy if exists "owners or staff read ownership documents" on storage.objects;
drop policy if exists "owners or staff read verification documents" on storage.objects;
drop policy if exists "staff read owner verification documents" on storage.objects;
create policy "staff read owner verification documents"
on storage.objects for select to authenticated
using (bucket_id = 'verification_documents' and private.is_staff());

drop policy if exists "approved owners create draft or pending properties" on public.properties;
drop policy if exists "approved owners create draft properties" on public.properties;
create policy "approved owners create draft properties" on public.properties for insert to authenticated
with check (owner_id = auth.uid() and private.current_user_role() = 'owner'::public.app_role and verification_status = 'draft'::public.verification_status);

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status and current_setting('app.property_lifecycle_operation', true) is distinct from 'owner_availability' then
      raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501';
    end if;
    if old.verification_status is distinct from new.verification_status then
      if not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then
        raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.property_media
        where property_id = old.id
          and media_type = 'verification_document'::public.media_type
          and storage_bucket = 'verification_documents'
          and verification_document_kind = 'national_id'
      ) then
        raise exception 'يلزم رفع صورة بطاقة شخصية وطنية صالحة قبل إرسال العقار للمراجعة.' using errcode = 'P0002';
      end if;
    end if;
  end if;
  return new;
end;
$$;

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
  if not exists (select 1 from public.property_media where property_id = property_row.id and media_type = 'verification_document'::public.media_type and storage_bucket = 'verification_documents' and verification_document_kind = 'national_id') then
    raise exception 'يلزم رفع صورة البطاقة الشخصية في مساحة التحقق الخاصة قبل إرسال العقار للمراجعة.' using errcode = 'P0002';
  end if;
  update public.properties set verification_status = 'pending'::public.verification_status, review_reason = null where id = property_row.id returning * into property_row;
  return property_row;
end;
$$;

alter table public.bookings
  add column if not exists viewing_terms_accepted_at timestamptz;

create or replace function private.enforce_booking_terms_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.viewing_terms_accepted_at is null then
    raise exception 'Viewing terms acceptance is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.viewing_terms_accepted_at is distinct from new.viewing_terms_accepted_at then
    raise exception 'Viewing terms acceptance is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_booking_terms_acceptance on public.bookings;
create trigger enforce_booking_terms_acceptance
before insert or update on public.bookings
for each row execute function private.enforce_booking_terms_acceptance();

drop function if exists public.create_viewing_request(uuid, timestamptz, text, text, smallint, text);
create function public.create_viewing_request(target_property_id uuid, target_requested_viewing_at timestamptz, target_contact_name text, target_phone text, target_people_count smallint, target_notes text, target_terms_accepted boolean)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare property_record public.properties%rowtype; configured_fee integer; created_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then raise exception 'Only the authenticated student may create a viewing request' using errcode = '42501'; end if;
  if target_terms_accepted is distinct from true then raise exception 'يجب الموافقة على شروط المعاينة وقواعد التنسيق قبل إرسال الطلب.' using errcode = '42501'; end if;
  if target_requested_viewing_at < now() then raise exception 'The requested viewing time must be in the future' using errcode = '22007'; end if;
  select * into property_record from public.properties where id = target_property_id and deleted_at is null and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status;
  if not found then raise exception 'The requested property is not available for viewing' using errcode = 'P0002'; end if;
  if property_record.owner_id = auth.uid() then raise exception 'A student cannot request a viewing for their own property' using errcode = '42501'; end if;
  select fee_amount into configured_fee from public.viewing_fee_rules where property_record.capacity >= min_capacity and (max_capacity is null or property_record.capacity <= max_capacity);
  if not found then raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار حالياً.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookings where property_id = target_property_id and student_id = auth.uid() and status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)) then raise exception 'لديك بالفعل طلب معاينة نشط لهذا العقار.' using errcode = '23505'; end if;
  perform set_config('app.sakeno_booking_operation', 'create_viewing_request', true);
  insert into public.bookings (property_id, student_id, contact_name, phone, people_count, preferred_contact_time, notes, status, requested_viewing_at, fee_amount, payment_status, viewing_terms_accepted_at)
    values (target_property_id, auth.uid(), target_contact_name, target_phone, target_people_count, 'any', target_notes, 'pending'::public.booking_status, target_requested_viewing_at, configured_fee, 'pending'::public.viewing_payment_status, now())
    returning * into created_booking;
  insert into public.booking_financials (booking_id, inspection_fee_amount) values (created_booking.id, configured_fee);
  return created_booking;
end;
$$;

revoke all on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text, boolean) from public, anon;
grant execute on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text, boolean) to authenticated;
revoke all on function private.enforce_booking_terms_acceptance() from public, anon, authenticated;

commit;
