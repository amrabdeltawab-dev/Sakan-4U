begin;

do $$ begin
  create type public.viewing_payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.student_viewing_decision as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.viewing_fee_credit_status as enum ('not_credited', 'credited');
exception when duplicate_object then null; end $$;

create table if not exists public.viewing_fee_rules (
  capacity smallint primary key check (capacity > 0),
  fee_amount integer not null check (fee_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.viewing_fee_rules (capacity, fee_amount)
values (4, 500), (6, 700)
on conflict (capacity) do update set fee_amount = excluded.fee_amount;

alter table public.viewing_fee_rules enable row level security;
revoke all on table public.viewing_fee_rules from public, anon, authenticated;

alter table public.bookings
  add column if not exists requested_viewing_at timestamptz,
  add column if not exists fee_amount integer,
  add column if not exists payment_status public.viewing_payment_status not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists payment_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists viewing_scheduled_at timestamptz,
  add column if not exists viewing_scheduled_by uuid references public.profiles(id) on delete set null,
  add column if not exists viewing_completed_at timestamptz,
  add column if not exists viewing_completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists student_viewing_decision public.student_viewing_decision not null default 'pending',
  add column if not exists fee_credit_status public.viewing_fee_credit_status not null default 'not_credited',
  add column if not exists fee_credited_at timestamptz;

update public.bookings
set requested_viewing_at = coalesce(requested_viewing_at, created_at)
where requested_viewing_at is null;

alter table public.bookings alter column requested_viewing_at set not null;
alter table public.bookings drop constraint if exists bookings_fee_amount_positive;
alter table public.bookings add constraint bookings_fee_amount_positive check (fee_amount is null or fee_amount > 0);
alter table public.bookings drop constraint if exists bookings_paid_metadata_consistent;
alter table public.bookings add constraint bookings_paid_metadata_consistent check (
  (payment_status = 'paid' and paid_at is not null and payment_recorded_by is not null)
  or (payment_status <> 'paid')
);
alter table public.bookings drop constraint if exists bookings_fee_credit_consistent;
alter table public.bookings add constraint bookings_fee_credit_consistent check (
  (fee_credit_status = 'credited' and fee_credited_at is not null and student_viewing_decision = 'accepted')
  or (fee_credit_status = 'not_credited')
);

create index if not exists bookings_viewing_coordination_idx
  on public.bookings (payment_status, requested_viewing_at, status);

create or replace function private.assert_staff_actor()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.current_user_role() not in ('admin'::public.app_role, 'super_admin'::public.app_role) then
    raise exception 'Only staff may coordinate viewing requests' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.quote_viewing_fee(target_property_id uuid)
returns table(fee_amount integer, capacity smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select rule.fee_amount, property.capacity
  from public.properties property
  join public.viewing_fee_rules rule on rule.capacity = property.capacity
  where property.id = target_property_id
    and property.verification_status = 'verified'::public.verification_status
    and property.availability_status = 'available'::public.availability_status;

  if not found then
    raise exception 'لا تتوفر رسوم معاينة معتمدة لهذا العقار حالياً.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.create_viewing_request(
  target_property_id uuid,
  target_requested_viewing_at timestamptz,
  target_contact_name text,
  target_phone text,
  target_people_count smallint,
  target_notes text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  property_record public.properties%rowtype;
  configured_fee integer;
  created_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then
    raise exception 'Only the authenticated student may create a viewing request' using errcode = '42501';
  end if;
  if target_requested_viewing_at < now() then
    raise exception 'The requested viewing time must be in the future' using errcode = '22007';
  end if;

  select * into property_record
  from public.properties
  where id = target_property_id
    and verification_status = 'verified'::public.verification_status
    and availability_status = 'available'::public.availability_status;
  if not found then
    raise exception 'The requested property is not available for viewing' using errcode = 'P0002';
  end if;
  if property_record.owner_id = auth.uid() then
    raise exception 'A student cannot request a viewing for their own property' using errcode = '42501';
  end if;

  select fee_amount into configured_fee from public.viewing_fee_rules where capacity = property_record.capacity;
  if not found then
    raise exception 'لا تتوفر رسوم معاينة معتمدة لهذا العقار حالياً.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.bookings
    where property_id = target_property_id
      and student_id = auth.uid()
      and status in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)
  ) then
    raise exception 'لديك بالفعل طلب معاينة نشط لهذا العقار.' using errcode = '23505';
  end if;

  perform set_config('app.sakeno_booking_operation', 'create_viewing_request', true);
  insert into public.bookings (
    property_id, student_id, contact_name, phone, people_count, preferred_contact_time, notes,
    status, requested_viewing_at, fee_amount, payment_status
  ) values (
    target_property_id, auth.uid(), target_contact_name, target_phone, target_people_count, 'any', target_notes,
    'pending'::public.booking_status, target_requested_viewing_at, configured_fee, 'pending'::public.viewing_payment_status
  ) returning * into created_booking;
  return created_booking;
end;
$$;

create or replace function public.transition_booking_status(
  target_booking_id uuid,
  target_status public.booking_status
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  transitioned_booking public.bookings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to transition a booking' using errcode = '42501';
  end if;
  perform set_config('app.sakeno_booking_operation', 'transition', true);
  update public.bookings set status = target_status
  where id = target_booking_id
  returning * into transitioned_booking;
  if not found then
    raise exception 'Booking was not found or is not accessible' using errcode = 'P0002';
  end if;
  return transitioned_booking;
end;
$$;

create or replace function public.record_viewing_fee_payment(target_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor();
  perform set_config('app.sakeno_booking_operation', 'record_payment', true);
  update public.bookings
  set payment_status = 'paid'::public.viewing_payment_status,
      paid_at = now(),
      payment_recorded_by = auth.uid()
  where id = target_booking_id and payment_status = 'pending'::public.viewing_payment_status
  returning * into updated_booking;
  if not found then raise exception 'The viewing fee cannot be recorded for this request' using errcode = 'P0002'; end if;
  return updated_booking;
end;
$$;

create or replace function public.schedule_viewing(target_booking_id uuid, target_viewing_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor();
  if target_viewing_at < now() then raise exception 'The viewing time must be in the future' using errcode = '22007'; end if;
  perform set_config('app.sakeno_booking_operation', 'schedule_viewing', true);
  update public.bookings
  set viewing_scheduled_at = target_viewing_at,
      viewing_scheduled_by = auth.uid()
  where id = target_booking_id
    and payment_status = 'paid'::public.viewing_payment_status
    and status = 'owner_confirmed'::public.booking_status
    and viewing_scheduled_at is null
  returning * into updated_booking;
  if not found then raise exception 'The viewing cannot be scheduled before owner confirmation and verified payment' using errcode = 'P0002'; end if;
  return updated_booking;
end;
$$;

create or replace function public.complete_viewing(target_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor();
  perform set_config('app.sakeno_booking_operation', 'complete_viewing', true);
  update public.bookings
  set viewing_completed_at = now(), viewing_completed_by = auth.uid()
  where id = target_booking_id
    and payment_status = 'paid'::public.viewing_payment_status
    and status = 'owner_confirmed'::public.booking_status
    and viewing_scheduled_at is not null
    and viewing_completed_at is null
  returning * into updated_booking;
  if not found then raise exception 'The viewing cannot be completed before it is scheduled' using errcode = 'P0002'; end if;
  return updated_booking;
end;
$$;

create or replace function public.record_student_viewing_decision(
  target_booking_id uuid,
  target_decision public.student_viewing_decision
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare updated_booking public.bookings%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role then
    raise exception 'Only the student may record a post-viewing decision' using errcode = '42501';
  end if;
  if target_decision not in ('accepted'::public.student_viewing_decision, 'rejected'::public.student_viewing_decision) then
    raise exception 'A final viewing decision is required' using errcode = '22023';
  end if;
  perform set_config('app.sakeno_booking_operation', 'student_decision', true);
  update public.bookings
  set student_viewing_decision = target_decision,
      fee_credit_status = case when target_decision = 'accepted'::public.student_viewing_decision then 'credited'::public.viewing_fee_credit_status else 'not_credited'::public.viewing_fee_credit_status end,
      fee_credited_at = case when target_decision = 'accepted'::public.student_viewing_decision then now() else null end,
      status = case when target_decision = 'accepted'::public.student_viewing_decision then 'student_confirmed'::public.booking_status else 'cancelled'::public.booking_status end
  where id = target_booking_id
    and student_id = auth.uid()
    and payment_status = 'paid'::public.viewing_payment_status
    and status = 'owner_confirmed'::public.booking_status
    and viewing_completed_at is not null
    and student_viewing_decision = 'pending'::public.student_viewing_decision
  returning * into updated_booking;
  if not found then raise exception 'The viewing decision cannot be recorded for this request' using errcode = 'P0002'; end if;
  return updated_booking;
end;
$$;

create or replace function private.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  operation text := coalesce(current_setting('app.sakeno_booking_operation', true), '');
begin
  if tg_op = 'INSERT' then
    if operation <> 'create_viewing_request'
       or auth.uid() is null
       or private.current_user_role() is distinct from 'student'::public.app_role
       or new.student_id is distinct from auth.uid()
       or new.status is distinct from 'pending'::public.booking_status
       or new.payment_status is distinct from 'pending'::public.viewing_payment_status
       or new.fee_amount is null
       or new.requested_viewing_at < now() then
      raise exception 'Only the authenticated student may create a pending viewing request' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.id is distinct from new.id
     or old.property_id is distinct from new.property_id
     or old.student_id is distinct from new.student_id
     or old.contact_name is distinct from new.contact_name
     or old.phone is distinct from new.phone
     or old.people_count is distinct from new.people_count
     or old.preferred_contact_time is distinct from new.preferred_contact_time
     or old.notes is distinct from new.notes
     or old.requested_viewing_at is distinct from new.requested_viewing_at
     or old.fee_amount is distinct from new.fee_amount
     or old.created_at is distinct from new.created_at then
    raise exception 'Viewing request details are immutable after creation' using errcode = '42501';
  end if;

  actor_role := private.current_user_role();

  if operation = 'record_payment' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role)
       or old.payment_status <> 'pending'::public.viewing_payment_status
       or new.payment_status <> 'paid'::public.viewing_payment_status
       or new.paid_at is null
       or new.payment_recorded_by is distinct from auth.uid()
       or old.status is distinct from new.status
       or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at
       or old.viewing_completed_at is distinct from new.viewing_completed_at
       or old.student_viewing_decision is distinct from new.student_viewing_decision
       or old.fee_credit_status is distinct from new.fee_credit_status
       or old.fee_credited_at is distinct from new.fee_credited_at then
      raise exception 'Only staff may record a verified viewing-fee payment' using errcode = '42501';
    end if;
    return new;
  end if;

  if operation = 'schedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role)
       or old.payment_status <> 'paid'::public.viewing_payment_status
       or old.status <> 'owner_confirmed'::public.booking_status
       or old.viewing_scheduled_at is not null
       or new.viewing_scheduled_at is null
       or new.viewing_scheduled_by is distinct from auth.uid()
       or old.status is distinct from new.status
       or old.payment_status is distinct from new.payment_status
       or old.viewing_completed_at is distinct from new.viewing_completed_at
       or old.student_viewing_decision is distinct from new.student_viewing_decision
       or old.fee_credit_status is distinct from new.fee_credit_status
       or old.fee_credited_at is distinct from new.fee_credited_at then
      raise exception 'Only staff may schedule a paid owner-confirmed viewing' using errcode = '42501';
    end if;
    return new;
  end if;

  if operation = 'complete_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role)
       or old.payment_status <> 'paid'::public.viewing_payment_status
       or old.viewing_scheduled_at is null
       or old.viewing_completed_at is not null
       or new.viewing_completed_at is null
       or new.viewing_completed_by is distinct from auth.uid()
       or old.status is distinct from new.status
       or old.payment_status is distinct from new.payment_status
       or old.student_viewing_decision is distinct from new.student_viewing_decision
       or old.fee_credit_status is distinct from new.fee_credit_status
       or old.fee_credited_at is distinct from new.fee_credited_at then
      raise exception 'Only staff may complete a scheduled viewing' using errcode = '42501';
    end if;
    return new;
  end if;

  if operation = 'student_decision' then
    if actor_role <> 'student'::public.app_role
       or old.student_id <> auth.uid()
       or old.payment_status <> 'paid'::public.viewing_payment_status
       or old.status <> 'owner_confirmed'::public.booking_status
       or old.viewing_completed_at is null
       or old.student_viewing_decision <> 'pending'::public.student_viewing_decision
       or not (
         (new.student_viewing_decision = 'accepted'::public.student_viewing_decision and new.status = 'student_confirmed'::public.booking_status and new.fee_credit_status = 'credited'::public.viewing_fee_credit_status and new.fee_credited_at is not null)
         or (new.student_viewing_decision = 'rejected'::public.student_viewing_decision and new.status = 'cancelled'::public.booking_status and new.fee_credit_status = 'not_credited'::public.viewing_fee_credit_status and new.fee_credited_at is null)
       ) then
      raise exception 'The student viewing decision is not allowed for this request' using errcode = '42501';
    end if;
    return new;
  end if;

  if operation <> 'transition' then
    raise exception 'Booking updates must use an authorized workflow operation' using errcode = '42501';
  end if;
  if old.payment_status is distinct from new.payment_status
     or old.paid_at is distinct from new.paid_at
     or old.payment_recorded_by is distinct from new.payment_recorded_by
     or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at
     or old.viewing_scheduled_by is distinct from new.viewing_scheduled_by
     or old.viewing_completed_at is distinct from new.viewing_completed_at
     or old.viewing_completed_by is distinct from new.viewing_completed_by
     or old.student_viewing_decision is distinct from new.student_viewing_decision
     or old.fee_credit_status is distinct from new.fee_credit_status
     or old.fee_credited_at is distinct from new.fee_credited_at then
    raise exception 'Payment and viewing fields require an authorized workflow operation' using errcode = '42501';
  end if;
  if old.status is not distinct from new.status then return new; end if;
  if auth.uid() is null then raise exception 'Authentication is required to transition a booking' using errcode = '42501'; end if;

  if actor_role = 'student'::public.app_role
     and old.student_id = auth.uid()
     and ((old.status = 'pending'::public.booking_status and new.status = 'cancelled'::public.booking_status)
       or (old.status = 'contacted'::public.booking_status and new.status = 'cancelled'::public.booking_status)
       or (old.status = 'owner_confirmed'::public.booking_status and new.status = 'cancelled'::public.booking_status and old.viewing_completed_at is null)) then
    return new;
  end if;
  if actor_role = 'owner'::public.app_role
     and private.owns_property(old.property_id)
     and ((old.status = 'pending'::public.booking_status and new.status in ('contacted'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status))
       or (old.status = 'contacted'::public.booking_status and new.status in ('owner_confirmed'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status))) then
    return new;
  end if;
  if actor_role in ('admin'::public.app_role, 'super_admin'::public.app_role)
     and old.status = 'student_confirmed'::public.booking_status
     and new.status = 'completed'::public.booking_status then
    return new;
  end if;
  raise exception 'Booking status transition from % to % is not allowed for this role', old.status, new.status using errcode = '42501';
end;
$$;

create or replace function public.list_student_viewing_requests()
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status,
    'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount,
    'paymentStatus', b.payment_status, 'paidAt', b.paid_at,
    'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at,
    'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status,
    'feeCreditedAt', b.fee_credited_at, 'notes', b.notes, 'peopleCount', b.people_count,
    'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'governorate', p.governorate, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity, 'availabilityStatus', p.availability_status, 'verificationStatus', p.verification_status)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  where b.student_id = auth.uid() and private.current_user_role() = 'student'::public.app_role
  order by b.updated_at desc;
$$;

create or replace function public.list_owner_viewing_requests()
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status,
    'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount,
    'paymentStatus', b.payment_status, 'viewingScheduledAt', b.viewing_scheduled_at,
    'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision,
    'feeCreditStatus', b.fee_credit_status, 'peopleCount', b.people_count,
    'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'interestedStudentMessage', concat('طالب مهتم بالعقار ', p.title, ' وطلب معاينة في ', to_char(b.requested_viewing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  where private.current_user_role() = 'owner'::public.app_role and private.owns_property(b.property_id)
  order by b.updated_at desc;
$$;

create or replace function public.list_staff_viewing_requests()
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'studentId', b.student_id, 'status', b.status,
    'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount,
    'paymentStatus', b.payment_status, 'paidAt', b.paid_at,
    'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at,
    'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status,
    'feeCreditedAt', b.fee_credited_at, 'notes', b.notes, 'peopleCount', b.people_count,
    'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'studentContact', jsonb_build_object('name', b.contact_name, 'phone', b.phone, 'email', student.email),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  join public.profiles student on student.id = b.student_id
  where private.is_staff()
  order by b.updated_at desc;
$$;

revoke all on table public.bookings from public, anon, authenticated;
revoke all on function public.quote_viewing_fee(uuid) from public;
revoke all on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text) from public, anon;
revoke all on function public.transition_booking_status(uuid, public.booking_status) from public, anon;
revoke all on function public.record_viewing_fee_payment(uuid) from public, anon;
revoke all on function public.schedule_viewing(uuid, timestamptz) from public, anon;
revoke all on function public.complete_viewing(uuid) from public, anon;
revoke all on function public.record_student_viewing_decision(uuid, public.student_viewing_decision) from public, anon;
revoke all on function public.list_student_viewing_requests() from public, anon;
revoke all on function public.list_owner_viewing_requests() from public, anon;
revoke all on function public.list_staff_viewing_requests() from public, anon;
grant execute on function public.quote_viewing_fee(uuid) to anon, authenticated;
grant execute on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text) to authenticated;
grant execute on function public.transition_booking_status(uuid, public.booking_status) to authenticated;
grant execute on function public.record_viewing_fee_payment(uuid) to authenticated;
grant execute on function public.schedule_viewing(uuid, timestamptz) to authenticated;
grant execute on function public.complete_viewing(uuid) to authenticated;
grant execute on function public.record_student_viewing_decision(uuid, public.student_viewing_decision) to authenticated;
grant execute on function public.list_student_viewing_requests() to authenticated;
grant execute on function public.list_owner_viewing_requests() to authenticated;
grant execute on function public.list_staff_viewing_requests() to authenticated;

commit;
