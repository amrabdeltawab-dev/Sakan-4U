begin;

alter table public.properties
  add column if not exists available_beds smallint;

update public.properties
  set available_beds = total_beds
  where rent_type = 'bed'::public.rent_type
    and available_beds is null;

alter table public.properties
  drop constraint if exists properties_bed_inventory_check;
alter table public.properties
  add constraint properties_bed_inventory_check check (
    (rent_type = 'full'::public.rent_type and available_beds is null)
    or (
      rent_type = 'bed'::public.rent_type
      and available_beds between 0 and total_beds
    )
  );

create index if not exists properties_bed_inventory_discovery_idx
  on public.properties (rent_type, available_beds)
  where deleted_at is null and verification_status = 'verified'::public.verification_status;

alter table public.bookings
  add column if not exists requested_rent_type public.rent_type not null default 'full'::public.rent_type;

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
        select 1 from public.bookings b
        where b.property_id = old.id
          and b.status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)
      ) then
        raise exception 'لا يمكن تغيير طريقة التأجير أو عدد الأسرة مع وجود طلبات نشطة.' using errcode = '42501';
      end if;
      if new.rent_type = 'bed'::public.rent_type then
        new.available_beds := new.total_beds;
      else
        new.available_beds := null;
      end if;
    end if;
    if private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
      if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
      if old.availability_status is distinct from new.availability_status
        and lifecycle_operation not in ('owner_availability', 'booking_reservation', 'bed_inventory_confirmation', 'bed_inventory_release') then
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

create or replace function private.enforce_property_bed_inventory()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.rent_type = 'bed'::public.rent_type then
      new.available_beds := new.total_beds;
    else
      new.available_beds := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_enforce_bed_inventory on public.properties;
create trigger properties_enforce_bed_inventory
  before insert on public.properties
  for each row execute procedure private.enforce_property_bed_inventory();

create or replace function private.enforce_booking_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role; operation text := coalesce(current_setting('app.sakeno_booking_operation', true), '');
begin
  if tg_op = 'INSERT' then
    if operation <> 'create_viewing_request' or auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role or new.student_id is distinct from auth.uid() or new.status is distinct from 'pending'::public.booking_status or new.payment_status is distinct from 'pending'::public.viewing_payment_status or new.fee_amount is null or new.requested_viewing_at < now() then raise exception 'Only the authenticated student may create a pending viewing request' using errcode = '42501'; end if;
    return new;
  end if;
  if old.id is distinct from new.id or old.property_id is distinct from new.property_id or old.student_id is distinct from new.student_id or old.contact_name is distinct from new.contact_name or old.phone is distinct from new.phone or old.people_count is distinct from new.people_count or old.preferred_contact_time is distinct from new.preferred_contact_time or old.notes is distinct from new.notes or old.requested_viewing_at is distinct from new.requested_viewing_at or old.fee_amount is distinct from new.fee_amount or old.requested_rent_type is distinct from new.requested_rent_type or old.created_at is distinct from new.created_at then raise exception 'Viewing request details are immutable after creation' using errcode = '42501'; end if;
  actor_role := private.current_user_role();
  if operation = 'provider_payment' then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' or old.payment_status <> 'pending'::public.viewing_payment_status or new.payment_status <> 'paid'::public.viewing_payment_status or new.paid_at is null or new.payment_recorded_by is not null or old.status is distinct from new.status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only a trusted provider adapter may confirm a matching payment' using errcode = '42501'; end if;
    return new;
  end if;
  if operation = 'record_payment' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'pending'::public.viewing_payment_status or new.payment_status <> 'paid'::public.viewing_payment_status or new.paid_at is null or new.payment_recorded_by is distinct from auth.uid() or old.status is distinct from new.status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may record a verified viewing-fee payment' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'schedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_scheduled_at is not null or new.viewing_scheduled_at is null or new.viewing_scheduled_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may schedule a paid owner-confirmed viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'reschedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_scheduled_at is null or old.viewing_completed_at is not null or new.viewing_scheduled_at is null or new.viewing_scheduled_at <= now() or new.viewing_scheduled_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may reschedule an incomplete paid viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'cancel_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.status not in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status) or old.viewing_completed_at is not null or new.status <> 'cancelled'::public.booking_status or old.payment_status is distinct from new.payment_status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may confirm a reasoned pre-completion cancellation' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'record_no_show' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.status <> 'owner_confirmed'::public.booking_status or old.payment_status <> 'paid'::public.viewing_payment_status or old.viewing_scheduled_at is null or old.viewing_scheduled_at > now() or old.viewing_completed_at is not null or new.status <> 'no_show'::public.booking_status or old.payment_status is distinct from new.payment_status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may record a missed scheduled viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'complete_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.viewing_scheduled_at is null or old.viewing_completed_at is not null or new.viewing_completed_at is null or new.viewing_completed_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may complete a scheduled viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'student_decision' then
    if actor_role <> 'student'::public.app_role or old.student_id <> auth.uid() or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_completed_at is null or old.student_viewing_decision <> 'pending'::public.student_viewing_decision or not ((new.student_viewing_decision = 'accepted'::public.student_viewing_decision and new.status = 'student_confirmed'::public.booking_status and new.fee_credit_status = 'credited'::public.viewing_fee_credit_status and new.fee_credited_at is not null) or (new.student_viewing_decision = 'rejected'::public.student_viewing_decision and new.status = 'cancelled'::public.booking_status and new.fee_credit_status = 'not_credited'::public.viewing_fee_credit_status and new.fee_credited_at is null)) then raise exception 'The student viewing decision is not allowed for this request' using errcode = '42501'; end if; return new;
  end if;
  if operation <> 'transition' then raise exception 'Booking updates must use an authorized workflow operation' using errcode = '42501'; end if;
  if old.payment_status is distinct from new.payment_status or old.paid_at is distinct from new.paid_at or old.payment_recorded_by is distinct from new.payment_recorded_by or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_scheduled_by is distinct from new.viewing_scheduled_by or old.viewing_completed_at is distinct from new.viewing_completed_at or old.viewing_completed_by is distinct from new.viewing_completed_by or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Payment and viewing fields require an authorized workflow operation' using errcode = '42501'; end if;
  if old.status is not distinct from new.status then return new; end if;
  if auth.uid() is null then raise exception 'Authentication is required to transition a booking' using errcode = '42501'; end if;
  if actor_role = 'owner'::public.app_role and private.owns_property(old.property_id) and ((old.status = 'pending'::public.booking_status and new.status in ('contacted'::public.booking_status, 'rejected'::public.booking_status)) or (old.status = 'contacted'::public.booking_status and new.status in ('owner_confirmed'::public.booking_status, 'rejected'::public.booking_status))) then return new; end if;
  if actor_role in ('admin'::public.app_role, 'super_admin'::public.app_role) and old.status = 'student_confirmed'::public.booking_status and new.status = 'completed'::public.booking_status then return new; end if;
  raise exception 'Booking status transition from % to % is not allowed for this role', old.status, new.status using errcode = '42501';
end;
$$;

create or replace function private.sync_property_viewing_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inventory_changed integer;
begin
  if new.status = 'owner_confirmed'::public.booking_status and old.status is distinct from new.status then
    if old.requested_rent_type = 'bed'::public.rent_type then
      perform set_config('app.property_lifecycle_operation', 'bed_inventory_confirmation', true);
      update public.properties
        set available_beds = available_beds - 1,
            availability_status = case when available_beds = 1 then 'hidden'::public.availability_status else availability_status end
        where id = new.property_id and rent_type = 'bed'::public.rent_type and verification_status = 'verified'::public.verification_status and available_beds > 0;
      get diagnostics inventory_changed = row_count;
      if inventory_changed <> 1 then raise exception 'لا يوجد سرير متاح لتأكيد هذا الطلب.' using errcode = 'P0002'; end if;
    else
      perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
      update public.properties set availability_status = 'reserved'::public.availability_status where id = new.property_id and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status;
    end if;
  elsif new.status in ('cancelled'::public.booking_status, 'rejected'::public.booking_status) and old.status = 'owner_confirmed'::public.booking_status then
    if old.requested_rent_type = 'bed'::public.rent_type then
      perform set_config('app.property_lifecycle_operation', 'bed_inventory_release', true);
      update public.properties
        set available_beds = least(total_beds, available_beds + 1),
            availability_status = case when availability_status = 'hidden'::public.availability_status then 'available'::public.availability_status else availability_status end
        where id = new.property_id and rent_type = 'bed'::public.rent_type;
    elsif not exists (select 1 from public.bookings other_booking where other_booking.property_id = new.property_id and other_booking.id <> new.id and other_booking.status in ('owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)) then
      perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
      update public.properties set availability_status = 'available'::public.availability_status where id = new.property_id and verification_status = 'verified'::public.verification_status and availability_status = 'reserved'::public.availability_status;
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "public read verified available or reserved properties" on public.properties;
create policy "public read verified available or in-stock properties" on public.properties for select
  using (auth.uid() is null and verification_status = 'verified'::public.verification_status and availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status) and (rent_type = 'full'::public.rent_type or available_beds > 0));

create or replace function public.create_viewing_request(target_property_id uuid, target_requested_viewing_at timestamptz, target_contact_name text, target_phone text, target_people_count smallint, target_notes text, target_terms_accepted boolean)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare property_record public.properties%rowtype; configured_fee integer; created_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then raise exception 'Only the authenticated student may create a viewing request' using errcode = '42501'; end if;
  if target_terms_accepted is distinct from true then raise exception 'يجب الموافقة على شروط المعاينة وقواعد التنسيق قبل إرسال الطلب.' using errcode = '42501'; end if;
  if target_requested_viewing_at < now() then raise exception 'The requested viewing time must be in the future' using errcode = '22007'; end if;
  select * into property_record from public.properties where id = target_property_id and deleted_at is null and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status and (rent_type = 'full'::public.rent_type or available_beds > 0);
  if not found then raise exception 'The requested property is not available for viewing' using errcode = 'P0002'; end if;
  if property_record.owner_id = auth.uid() then raise exception 'A student cannot request a viewing for their own property' using errcode = '42501'; end if;
  select fee_amount into configured_fee from public.viewing_fee_rules where property_record.capacity >= min_capacity and (max_capacity is null or property_record.capacity <= max_capacity);
  if not found then raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار حالياً.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookings where property_id = target_property_id and student_id = auth.uid() and status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)) then raise exception 'لديك بالفعل طلب معاينة نشط لهذا العقار.' using errcode = '23505'; end if;
  perform set_config('app.sakeno_booking_operation', 'create_viewing_request', true);
  insert into public.bookings (property_id, student_id, contact_name, phone, people_count, preferred_contact_time, notes, status, requested_viewing_at, fee_amount, payment_status, viewing_terms_accepted_at, requested_rent_type)
    values (target_property_id, auth.uid(), target_contact_name, target_phone, target_people_count, 'any', target_notes, 'pending'::public.booking_status, target_requested_viewing_at, configured_fee, 'pending'::public.viewing_payment_status, now(), property_record.rent_type)
    returning * into created_booking;
  insert into public.booking_financials (booking_id, inspection_fee_amount) values (created_booking.id, configured_fee);
  return created_booking;
end;
$$;

create or replace function public.list_owner_viewing_requests()
returns setof jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status, 'requestedRentType', b.requested_rent_type, 'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount, 'paymentStatus', b.payment_status, 'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'rescheduleRequest', (select jsonb_build_object('status', r.status, 'requestedViewingAt', r.requested_viewing_at, 'createdAt', r.created_at, 'requestedByRole', r.requested_by_role, 'reason', case when r.requested_by = auth.uid() then r.reason else null end, 'confirmedViewingAt', r.confirmed_viewing_at) from public.viewing_reschedule_requests r where r.booking_id = b.id order by r.created_at desc limit 1),
    'cancellationRequest', (select jsonb_build_object('status', c.status, 'createdAt', c.created_at, 'requestedByRole', c.requested_by_role, 'reason', case when c.requested_by = auth.uid() then c.reason else null end) from public.viewing_cancellation_requests c where c.booking_id = b.id order by c.created_at desc limit 1),
    'noShow', (select jsonb_build_object('party', n.no_show_party, 'recordedAt', n.recorded_at) from public.viewing_no_show_records n where n.booking_id = b.id),
    'interestedStudentMessage', concat('طالب مهتم بالعقار ', p.title, ' وطلب معاينة في ', to_char(b.requested_viewing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'rentType', p.rent_type, 'availableBeds', p.available_beds)
  ) from public.bookings b join public.properties p on p.id = b.property_id where private.current_user_role() = 'owner'::public.app_role and private.owns_property(b.property_id) order by b.updated_at desc;
$$;

create or replace function public.list_staff_viewing_requests()
returns setof jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'studentId', b.student_id, 'status', b.status, 'requestedRentType', b.requested_rent_type, 'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount, 'paymentStatus', b.payment_status, 'paidAt', b.paid_at, 'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status, 'feeCreditedAt', b.fee_credited_at, 'notes', b.notes, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'refundStatus', f.refund_status, 'refundReviewStatus', f.refund_review_status, 'amountPaid', f.amount_paid, 'amountRefunded', f.amount_refunded, 'amountCreditedTowardFinal', f.amount_credited_toward_final, 'amountDue', f.amount_due, 'finalSettlementStatus', f.final_settlement_status,
    'rescheduleRequest', (select jsonb_build_object('id', r.id, 'status', r.status, 'previousViewingAt', r.previous_viewing_at, 'requestedViewingAt', r.requested_viewing_at, 'requestedByRole', r.requested_by_role, 'reason', r.reason, 'createdAt', r.created_at, 'confirmedViewingAt', r.confirmed_viewing_at) from public.viewing_reschedule_requests r where r.booking_id = b.id order by r.created_at desc limit 1),
    'cancellationRequest', (select jsonb_build_object('id', c.id, 'status', c.status, 'previousBookingStatus', c.previous_booking_status, 'requestedByRole', c.requested_by_role, 'reason', c.reason, 'createdAt', c.created_at) from public.viewing_cancellation_requests c where c.booking_id = b.id order by c.created_at desc limit 1),
    'noShow', (select jsonb_build_object('id', n.id, 'party', n.no_show_party, 'reason', n.reason, 'recordedAt', n.recorded_at) from public.viewing_no_show_records n where n.booking_id = b.id),
    'refundDecision', (select jsonb_build_object('id', d.id, 'decision', d.decision, 'amount', d.amount, 'reason', d.reason, 'reference', d.reference, 'decidedAt', d.decided_at) from public.booking_refund_decisions d where d.booking_id = b.id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('eventType', h.event_type, 'actorRole', h.actor_role, 'oldStatus', h.old_booking_status, 'newStatus', h.new_booking_status, 'previousViewingAt', h.previous_viewing_at, 'newViewingAt', h.new_viewing_at, 'reason', h.reason, 'createdAt', h.created_at) order by h.created_at asc) from public.viewing_operational_history h where h.booking_id = b.id), '[]'::jsonb),
    'studentContact', jsonb_build_object('name', b.contact_name, 'phone', b.phone, 'email', student.email),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity, 'rentType', p.rent_type, 'availableBeds', p.available_beds)
  ) from public.bookings b join public.properties p on p.id = b.property_id join public.profiles student on student.id = b.student_id left join public.booking_financials f on f.booking_id = b.id where private.is_staff() order by b.updated_at desc;
$$;

revoke all on function private.enforce_property_bed_inventory(), private.sync_property_viewing_reservation() from public, anon, authenticated;
revoke all on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text, boolean), public.list_owner_viewing_requests(), public.list_staff_viewing_requests() from public, anon;
grant execute on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text, boolean), public.list_owner_viewing_requests(), public.list_staff_viewing_requests() to authenticated;

commit;
