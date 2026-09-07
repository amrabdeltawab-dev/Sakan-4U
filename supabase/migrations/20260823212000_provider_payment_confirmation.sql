begin;

alter table public.bookings drop constraint if exists bookings_paid_metadata_consistent;
alter table public.bookings add constraint bookings_paid_metadata_consistent check (
  (payment_status = 'paid' and paid_at is not null) or payment_status <> 'paid'
);

create or replace function private.enforce_booking_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare actor_role public.app_role; operation text := coalesce(current_setting('app.sakeno_booking_operation', true), '');
begin
  if tg_op = 'INSERT' then
    if operation <> 'create_viewing_request' or auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role or new.student_id is distinct from auth.uid() or new.status is distinct from 'pending'::public.booking_status or new.payment_status is distinct from 'pending'::public.viewing_payment_status or new.fee_amount is null or new.requested_viewing_at < now() then raise exception 'Only the authenticated student may create a pending viewing request' using errcode = '42501'; end if;
    return new;
  end if;
  if old.id is distinct from new.id or old.property_id is distinct from new.property_id or old.student_id is distinct from new.student_id or old.contact_name is distinct from new.contact_name or old.phone is distinct from new.phone or old.people_count is distinct from new.people_count or old.preferred_contact_time is distinct from new.preferred_contact_time or old.notes is distinct from new.notes or old.requested_viewing_at is distinct from new.requested_viewing_at or old.fee_amount is distinct from new.fee_amount or old.created_at is distinct from new.created_at then raise exception 'Viewing request details are immutable after creation' using errcode = '42501'; end if;
  actor_role := private.current_user_role();
  if operation = 'provider_payment' then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' or old.payment_status <> 'pending'::public.viewing_payment_status or new.payment_status <> 'paid'::public.viewing_payment_status or new.paid_at is null or new.payment_recorded_by is not null or old.status is distinct from new.status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only a trusted provider adapter may confirm a matching payment' using errcode = '42501'; end if;
    return new;
  end if;
  if operation = 'record_payment' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'pending'::public.viewing_payment_status or new.payment_status <> 'paid'::public.viewing_payment_status or new.paid_at is null or new.payment_recorded_by is distinct from auth.uid() or old.status is distinct from new.status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may record a verified viewing-fee payment' using errcode = '42501'; end if;
    return new;
  end if;
  if operation = 'schedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_scheduled_at is not null or new.viewing_scheduled_at is null or new.viewing_scheduled_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may schedule a paid owner-confirmed viewing' using errcode = '42501'; end if;
    return new;
  end if;
  if operation = 'complete_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.viewing_scheduled_at is null or old.viewing_completed_at is not null or new.viewing_completed_at is null or new.viewing_completed_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may complete a scheduled viewing' using errcode = '42501'; end if;
    return new;
  end if;
  if operation = 'student_decision' then
    if actor_role <> 'student'::public.app_role or old.student_id <> auth.uid() or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_completed_at is null or old.student_viewing_decision <> 'pending'::public.student_viewing_decision or not ((new.student_viewing_decision = 'accepted'::public.student_viewing_decision and new.status = 'student_confirmed'::public.booking_status and new.fee_credit_status = 'credited'::public.viewing_fee_credit_status and new.fee_credited_at is not null) or (new.student_viewing_decision = 'rejected'::public.student_viewing_decision and new.status = 'cancelled'::public.booking_status and new.fee_credit_status = 'not_credited'::public.viewing_fee_credit_status and new.fee_credited_at is null)) then raise exception 'The student viewing decision is not allowed for this request' using errcode = '42501'; end if;
    return new;
  end if;
  if operation <> 'transition' then raise exception 'Booking updates must use an authorized workflow operation' using errcode = '42501'; end if;
  if old.payment_status is distinct from new.payment_status or old.paid_at is distinct from new.paid_at or old.payment_recorded_by is distinct from new.payment_recorded_by or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_scheduled_by is distinct from new.viewing_scheduled_by or old.viewing_completed_at is distinct from new.viewing_completed_at or old.viewing_completed_by is distinct from new.viewing_completed_by or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Payment and viewing fields require an authorized workflow operation' using errcode = '42501'; end if;
  if old.status is not distinct from new.status then return new; end if;
  if auth.uid() is null then raise exception 'Authentication is required to transition a booking' using errcode = '42501'; end if;
  if actor_role = 'student'::public.app_role and old.student_id = auth.uid() and ((old.status = 'pending'::public.booking_status and new.status = 'cancelled'::public.booking_status) or (old.status = 'contacted'::public.booking_status and new.status = 'cancelled'::public.booking_status) or (old.status = 'owner_confirmed'::public.booking_status and new.status = 'cancelled'::public.booking_status and old.viewing_completed_at is null)) then return new; end if;
  if actor_role = 'owner'::public.app_role and private.owns_property(old.property_id) and ((old.status = 'pending'::public.booking_status and new.status in ('contacted'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status)) or (old.status = 'contacted'::public.booking_status and new.status in ('owner_confirmed'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status))) then return new; end if;
  if actor_role in ('admin'::public.app_role, 'super_admin'::public.app_role) and old.status = 'student_confirmed'::public.booking_status and new.status = 'completed'::public.booking_status then return new; end if;
  raise exception 'Booking status transition from % to % is not allowed for this role', old.status, new.status using errcode = '42501';
end;
$$;

create function public.process_provider_inspection_payment(
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

revoke all on function public.process_provider_inspection_payment(text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.process_provider_inspection_payment(text, text, text, uuid, integer) to service_role;

commit;
