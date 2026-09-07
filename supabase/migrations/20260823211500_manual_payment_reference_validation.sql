begin;

create or replace function public.record_manual_inspection_payment(target_booking_id uuid, target_reference text)
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

commit;
