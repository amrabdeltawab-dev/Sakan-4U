begin;

alter table public.properties
  alter column verification_status set default 'draft'::public.verification_status;

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status
      and coalesce(current_setting('app.property_lifecycle_operation', true), '') not in ('owner_availability', 'booking_reservation') then
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

commit;
