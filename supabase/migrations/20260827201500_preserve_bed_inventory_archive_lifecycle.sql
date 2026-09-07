begin;

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lifecycle_operation text := coalesce(current_setting('app.property_lifecycle_operation', true), '');
begin
  if tg_op = 'UPDATE' then
    if new.available_beds is distinct from old.available_beds
      and lifecycle_operation not in ('bed_inventory_confirmation', 'bed_inventory_release') then
      raise exception 'لا يمكن تغيير الأسرة المتاحة إلا من خلال تأكيد طلب سرير أو إلغائه.' using errcode = '42501';
    end if;
    if new.rent_type is distinct from old.rent_type or new.total_beds is distinct from old.total_beds then
      if exists (
        select 1 from public.bookings b where b.property_id = old.id
          and b.status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)
      ) then
        raise exception 'لا يمكن تغيير طريقة التأجير أو عدد الأسرة مع وجود طلبات نشطة.' using errcode = '42501';
      end if;
      if new.rent_type = 'bed'::public.rent_type then new.available_beds := new.total_beds; else new.available_beds := null; end if;
    end if;
    if private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
      if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
      if old.deleted_at is distinct from new.deleted_at and lifecycle_operation <> 'property_archive' then raise exception 'أرشف العقار من خلال العملية المحمية.' using errcode = '42501'; end if;
      if old.availability_status is distinct from new.availability_status
        and lifecycle_operation not in ('owner_availability', 'booking_reservation', 'bed_inventory_confirmation', 'bed_inventory_release', 'property_archive') then
        raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501';
      end if;
      if old.verification_status is distinct from new.verification_status then
        if not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then
          raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501';
        end if;
        if not exists (select 1 from public.property_media where property_id = old.id and media_type = 'verification_document'::public.media_type and storage_bucket = 'verification_documents' and verification_document_kind = 'national_id') then
          raise exception 'يلزم رفع صورة بطاقة شخصية وطنية صالحة قبل إرسال العقار للمراجعة.' using errcode = 'P0002';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_owner_property_lifecycle() from public, anon, authenticated;

commit;
