begin;

drop policy if exists "public read verified available properties" on public.properties;
create policy "public read verified available or reserved properties" on public.properties for select
  using (
    auth.uid() is null
    and verification_status = 'verified'::public.verification_status
    and availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)
  );

create or replace function private.enforce_owner_property_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.current_user_role() = 'owner'::public.app_role and old.owner_id = auth.uid() then
    if new.owner_id is distinct from old.owner_id then raise exception 'لا يمكن تغيير مالك العقار.' using errcode = '42501'; end if;
    if old.availability_status is distinct from new.availability_status
      and current_setting('app.property_lifecycle_operation', true) not in ('owner_availability', 'booking_reservation') then
      raise exception 'غيّر توفر العقار من خلال العملية المحمية.' using errcode = '42501';
    end if;
    if old.verification_status is distinct from new.verification_status and not (new.verification_status = 'pending'::public.verification_status and old.verification_status in ('draft'::public.verification_status, 'verified'::public.verification_status, 'needs_changes'::public.verification_status, 'rejected'::public.verification_status)) then
      raise exception 'لا يمكن تغيير حالة المراجعة مباشرة.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.sync_property_viewing_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'owner_confirmed'::public.booking_status
    and old.status is distinct from new.status then
    perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
    update public.properties
      set availability_status = 'reserved'::public.availability_status
      where id = new.property_id
        and verification_status = 'verified'::public.verification_status
        and availability_status = 'available'::public.availability_status;
  elsif new.status in ('cancelled'::public.booking_status, 'rejected'::public.booking_status)
    and old.status = 'owner_confirmed'::public.booking_status then
    if not exists (
      select 1 from public.bookings other_booking
      where other_booking.property_id = new.property_id
        and other_booking.id <> new.id
        and other_booking.status in ('owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)
    ) then
      perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
      update public.properties
        set availability_status = 'available'::public.availability_status
        where id = new.property_id
          and verification_status = 'verified'::public.verification_status
          and availability_status = 'reserved'::public.availability_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_property_viewing_reservation on public.bookings;
create trigger sync_property_viewing_reservation
  after update of status on public.bookings
  for each row execute procedure private.sync_property_viewing_reservation();

revoke all on function private.sync_property_viewing_reservation() from public, anon, authenticated;

commit;
