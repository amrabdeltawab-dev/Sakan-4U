begin;

create or replace function private.prevent_viewing_history_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Operational viewing history is immutable' using errcode = '42501';
end;
$$;

drop trigger if exists viewing_operational_history_prevent_update on public.viewing_operational_history;
create trigger viewing_operational_history_prevent_update
before update on public.viewing_operational_history
for each row execute function private.prevent_viewing_history_update();

create or replace function public.staff_reschedule_viewing(target_booking_id uuid, target_viewing_at timestamptz, target_reason text)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare booking_record public.bookings%rowtype; updated_booking public.bookings%rowtype; property_title text;
begin
  perform private.assert_staff_actor(); perform private.assert_exception_reason(target_reason);
  if target_viewing_at <= now() then raise exception 'يجب أن يكون الموعد الجديد في المستقبل.' using errcode = '22007'; end if;
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  if booking_record.status <> 'owner_confirmed'::public.booking_status or booking_record.payment_status <> 'paid'::public.viewing_payment_status or booking_record.viewing_scheduled_at is null or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن للإدارة تغيير الموعد في حالة المعاينة الحالية.' using errcode = 'P0002'; end if;
  if booking_record.viewing_scheduled_at = target_viewing_at then raise exception 'اختر موعداً مختلفاً عن الموعد الحالي.' using errcode = '22023'; end if;
  select p.title into property_title from public.properties p where p.id = booking_record.property_id;
  perform set_config('app.sakeno_booking_operation', 'reschedule_viewing', true);
  update public.bookings set viewing_scheduled_at = target_viewing_at, viewing_scheduled_by = auth.uid() where id = booking_record.id returning * into updated_booking;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, previous_viewing_at, new_viewing_at, reason)
  values (booking_record.id, 'reschedule_confirmed', auth.uid(), private.current_user_role(), booking_record.status, booking_record.status, booking_record.viewing_scheduled_at, target_viewing_at, trim(target_reason));
  perform private.notify_staff('staff_action_required', 'تم تعديل موعد المعاينة', 'عدلت الإدارة موعد معاينة عقار «' || property_title || '».', booking_record.property_id, booking_record.id, 'staff-reschedule:' || booking_record.id::text || ':' || target_viewing_at::text);
  return updated_booking;
end;
$$;

create or replace function public.staff_cancel_viewing(target_booking_id uuid, target_reason text)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare booking_record public.bookings%rowtype; updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor(); perform private.assert_exception_reason(target_reason);
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  if booking_record.status not in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status) or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن للإدارة إلغاء المعاينة في حالتها الحالية.' using errcode = 'P0002'; end if;
  perform set_config('app.sakeno_booking_operation', 'cancel_viewing', true);
  update public.bookings set status = 'cancelled'::public.booking_status where id = booking_record.id returning * into updated_booking;
  if updated_booking.payment_status = 'paid'::public.viewing_payment_status then
    perform private.open_manual_refund_review(updated_booking.id);
    insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason)
    values (updated_booking.id, 'refund_review_opened', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, 'يتطلب الإلغاء قرار استرداد يدوي.');
    perform private.notify_staff('staff_action_required', 'قرار استرداد يدوي مطلوب', 'إلغاء معاينة مدفوعة يحتاج قراراً مالياً يدوياً.', updated_booking.property_id, updated_booking.id, 'refund-review:staff-cancel:' || updated_booking.id::text);
  end if;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason)
  values (updated_booking.id, 'cancellation_confirmed', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, trim(target_reason));
  return updated_booking;
end;
$$;

revoke all on function private.prevent_viewing_history_update() from public, anon, authenticated;
revoke all on function public.staff_reschedule_viewing(uuid, timestamptz, text), public.staff_cancel_viewing(uuid, text) from public, anon;
grant execute on function public.staff_reschedule_viewing(uuid, timestamptz, text), public.staff_cancel_viewing(uuid, text) to authenticated;

commit;
