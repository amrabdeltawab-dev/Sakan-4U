begin;

create or replace function public.create_viewing_request(
  target_property_id uuid,
  target_requested_viewing_at timestamptz,
  target_contact_name text,
  target_phone text,
  target_people_count smallint,
  target_notes text default null
)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare property_record public.properties%rowtype; configured_fee integer; created_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then raise exception 'Only the authenticated student may create a viewing request' using errcode = '42501'; end if;
  if target_requested_viewing_at < now() then raise exception 'The requested viewing time must be in the future' using errcode = '22007'; end if;
  select * into property_record from public.properties where id = target_property_id and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status;
  if not found then raise exception 'The requested property is not available for viewing' using errcode = 'P0002'; end if;
  if property_record.owner_id = auth.uid() then raise exception 'A student cannot request a viewing for their own property' using errcode = '42501'; end if;
  select fee_amount into configured_fee from public.viewing_fee_rules where property_record.capacity >= min_capacity and (max_capacity is null or property_record.capacity <= max_capacity);
  if not found then raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار. يرجى المحاولة لاحقاً أو التواصل مع فريق ساكينو.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookings where property_id = target_property_id and student_id = auth.uid() and status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)) then raise exception 'لديك بالفعل طلب معاينة نشط لهذا العقار.' using errcode = '23505'; end if;
  perform set_config('app.sakeno_booking_operation', 'create_viewing_request', true);
  insert into public.bookings (property_id, student_id, contact_name, phone, people_count, preferred_contact_time, notes, status, requested_viewing_at, fee_amount, payment_status)
  values (target_property_id, auth.uid(), target_contact_name, target_phone, target_people_count, 'any', target_notes, 'pending'::public.booking_status, target_requested_viewing_at, configured_fee, 'pending'::public.viewing_payment_status)
  returning * into created_booking;
  insert into public.booking_financials (booking_id, inspection_fee_amount) values (created_booking.id, configured_fee);
  return created_booking;
end;
$$;

create function public.record_manual_inspection_payment(target_booking_id uuid, target_reference text)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor();
  if char_length(trim(coalesce(target_reference, ''))) < 3 or trim(target_reference) ~* '(fake|test|demo)' then raise exception 'A verified manual payment reference is required' using errcode = '22023'; end if;
  perform set_config('app.sakeno_booking_operation', 'record_payment', true);
  update public.bookings set payment_status = 'paid'::public.viewing_payment_status, paid_at = now(), payment_recorded_by = auth.uid()
  where id = target_booking_id and payment_status = 'pending'::public.viewing_payment_status returning * into updated_booking;
  if not found then raise exception 'The viewing fee cannot be recorded for this request' using errcode = 'P0002'; end if;
  insert into public.booking_payment_transactions (booking_id, transaction_type, status, amount, provider_name, provider_reference, verified_at, verified_by)
  values (updated_booking.id, 'inspection_fee', 'verified', updated_booking.fee_amount, 'manual', trim(target_reference), now(), auth.uid());
  update public.booking_financials set amount_paid = updated_booking.fee_amount, updated_at = now() where booking_id = updated_booking.id;
  return updated_booking;
end;
$$;

create or replace function public.record_student_viewing_decision(target_booking_id uuid, target_decision public.student_viewing_decision)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then raise exception 'Only the student may record a post-viewing decision' using errcode = '42501'; end if;
  if target_decision not in ('accepted'::public.student_viewing_decision, 'rejected'::public.student_viewing_decision) then raise exception 'A final viewing decision is required' using errcode = '22023'; end if;
  perform set_config('app.sakeno_booking_operation', 'student_decision', true);
  update public.bookings set student_viewing_decision = target_decision,
    fee_credit_status = case when target_decision = 'accepted'::public.student_viewing_decision then 'credited'::public.viewing_fee_credit_status else 'not_credited'::public.viewing_fee_credit_status end,
    fee_credited_at = case when target_decision = 'accepted'::public.student_viewing_decision then now() else null end,
    status = case when target_decision = 'accepted'::public.student_viewing_decision then 'student_confirmed'::public.booking_status else 'cancelled'::public.booking_status end
  where id = target_booking_id and student_id = auth.uid() and payment_status = 'paid'::public.viewing_payment_status and status = 'owner_confirmed'::public.booking_status and viewing_completed_at is not null and student_viewing_decision = 'pending'::public.student_viewing_decision
  returning * into updated_booking;
  if not found then raise exception 'The viewing decision cannot be recorded for this request' using errcode = 'P0002'; end if;
  update public.booking_financials set amount_credited_toward_final = case when target_decision = 'accepted' then updated_booking.fee_amount else 0 end,
    final_settlement_status = case when target_decision = 'accepted' then 'pending'::public.final_settlement_status else 'not_started'::public.final_settlement_status end,
    updated_at = now() where booking_id = updated_booking.id;
  return updated_booking;
end;
$$;

revoke all on function public.record_viewing_fee_payment(uuid) from public, anon, authenticated;
revoke all on function public.record_manual_inspection_payment(uuid, text) from public, anon;
grant execute on function public.record_manual_inspection_payment(uuid, text) to authenticated;

commit;
