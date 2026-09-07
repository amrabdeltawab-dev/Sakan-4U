begin;

create or replace function public.process_provider_inspection_payment(
  target_provider text, target_event_id text, target_reference text, target_booking_id uuid, target_amount integer
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare event_row public.payment_webhook_events%rowtype; booking_row public.bookings%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Only a trusted provider adapter may process payment callbacks' using errcode = '42501'; end if;
  if char_length(trim(coalesce(target_provider, ''))) < 2 or char_length(trim(coalesce(target_event_id, ''))) < 3 or char_length(trim(coalesce(target_reference, ''))) < 3 or target_amount <= 0 then raise exception 'Invalid provider callback evidence' using errcode = '22023'; end if;
  insert into public.payment_webhook_events (provider_name, provider_event_id, provider_reference, booking_id, status)
  values (trim(target_provider), trim(target_event_id), trim(target_reference), target_booking_id, 'received')
  on conflict (provider_name, provider_event_id) do nothing returning * into event_row;
  if not found then
    select e.* into event_row from public.payment_webhook_events e where e.provider_name = trim(target_provider) and e.provider_event_id = trim(target_event_id);
    return jsonb_build_object('bookingId', event_row.booking_id, 'eventStatus', event_row.status, 'idempotent', true);
  end if;
  select * into booking_row from public.bookings where id = target_booking_id for update;
  if not found or booking_row.payment_status <> 'pending'::public.viewing_payment_status or booking_row.fee_amount <> target_amount then
    update public.payment_webhook_events set status = 'rejected', processed_at = now() where id = event_row.id;
    return jsonb_build_object('bookingId', target_booking_id, 'eventStatus', 'rejected', 'idempotent', false);
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('app.sakeno_booking_operation', 'provider_payment', true);
  update public.bookings set payment_status = 'paid'::public.viewing_payment_status, paid_at = now(), payment_recorded_by = null where id = booking_row.id;
  insert into public.booking_payment_transactions (booking_id, transaction_type, status, amount, provider_name, provider_reference, verified_at)
  values (booking_row.id, 'inspection_fee', 'verified', target_amount, trim(target_provider), trim(target_reference), now());
  update public.booking_financials set amount_paid = target_amount, updated_at = now() where booking_id = booking_row.id;
  update public.payment_webhook_events set status = 'processed', processed_at = now() where id = event_row.id;
  return jsonb_build_object('bookingId', booking_row.id, 'eventStatus', 'processed', 'idempotent', false);
end;
$$;

commit;
