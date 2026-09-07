begin;

-- 20260823181000 renamed the historical exact-capacity key to bedrooms.
-- Replace that temporary model with authoritative inclusive capacity tiers.
alter table public.viewing_fee_rules rename column bedrooms to min_capacity;
alter table public.viewing_fee_rules add column max_capacity smallint;
alter table public.viewing_fee_rules add constraint viewing_fee_rules_range_valid check (max_capacity is null or max_capacity >= min_capacity);

update public.viewing_fee_rules
set min_capacity = 1, max_capacity = 4, fee_amount = 600
where min_capacity = 4;

update public.viewing_fee_rules
set min_capacity = 5, max_capacity = 6, fee_amount = 900
where min_capacity = 6;

insert into public.viewing_fee_rules (min_capacity, max_capacity, fee_amount)
values (7, null, 1000)
on conflict (min_capacity) do update set max_capacity = excluded.max_capacity, fee_amount = excluded.fee_amount, updated_at = now();

drop function if exists public.quote_viewing_fee(uuid);
create function public.quote_viewing_fee(target_property_id uuid)
returns table(fee_amount integer, capacity smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select rule.fee_amount, property.capacity
  from public.properties property
  join public.viewing_fee_rules rule
    on property.capacity >= rule.min_capacity
   and (rule.max_capacity is null or property.capacity <= rule.max_capacity)
  where property.id = target_property_id
    and property.verification_status = 'verified'::public.verification_status
    and property.availability_status = 'available'::public.availability_status;
  if not found then
    raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار. يرجى المحاولة لاحقاً أو التواصل مع فريق ساكينو.' using errcode = 'P0002';
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
  select * into property_record from public.properties
  where id = target_property_id
    and verification_status = 'verified'::public.verification_status
    and availability_status = 'available'::public.availability_status;
  if not found then
    raise exception 'The requested property is not available for viewing' using errcode = 'P0002';
  end if;
  if property_record.owner_id = auth.uid() then
    raise exception 'A student cannot request a viewing for their own property' using errcode = '42501';
  end if;
  select fee_amount into configured_fee
  from public.viewing_fee_rules
  where property_record.capacity >= min_capacity
    and (max_capacity is null or property_record.capacity <= max_capacity);
  if not found then
    raise exception 'تعذر تحديد رسوم خدمة المعاينة لهذا العقار. يرجى المحاولة لاحقاً أو التواصل مع فريق ساكينو.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.bookings
    where property_id = target_property_id and student_id = auth.uid()
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

revoke all on function public.quote_viewing_fee(uuid) from public;
grant execute on function public.quote_viewing_fee(uuid) to anon, authenticated;
revoke all on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text) from public, anon;
grant execute on function public.create_viewing_request(uuid, timestamptz, text, text, smallint, text) to authenticated;

commit;
