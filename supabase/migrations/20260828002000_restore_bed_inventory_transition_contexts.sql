begin;

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.deleted_at is distinct from new.deleted_at and current_setting('app.property_lifecycle_operation', true) <> 'property_archive' then raise exception 'أرشف العقار من خلال العملية المحمية.' using errcode = '42501'; end if;
    if (old.pending_edits is distinct from new.pending_edits or old.has_pending_updates is distinct from new.has_pending_updates) and current_setting('app.property_lifecycle_operation', true) <> 'staged_edits_submission' then raise exception 'أرسل تعديلات الإعلان عبر عملية المراجعة المحمية.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status and current_setting('app.property_lifecycle_operation', true) not in ('owner_availability', 'booking_reservation', 'property_archive', 'bed_inventory_confirmation', 'bed_inventory_release') then raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501'; end if;
    if old.verification_status is distinct from new.verification_status and not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_owner_property_lifecycle() from public, anon, authenticated;

commit;
