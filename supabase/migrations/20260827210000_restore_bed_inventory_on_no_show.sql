begin;

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
        where id = new.property_id
          and rent_type = 'bed'::public.rent_type
          and verification_status = 'verified'::public.verification_status
          and available_beds > 0;
      get diagnostics inventory_changed = row_count;
      if inventory_changed <> 1 then raise exception 'لا يوجد سرير متاح لتأكيد هذا الطلب.' using errcode = 'P0002'; end if;
    else
      perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
      update public.properties set availability_status = 'reserved'::public.availability_status
        where id = new.property_id and verification_status = 'verified'::public.verification_status and availability_status = 'available'::public.availability_status;
    end if;
  elsif new.status in ('cancelled'::public.booking_status, 'rejected'::public.booking_status, 'no_show'::public.booking_status)
    and old.status = 'owner_confirmed'::public.booking_status then
    if old.requested_rent_type = 'bed'::public.rent_type then
      perform set_config('app.property_lifecycle_operation', 'bed_inventory_release', true);
      update public.properties
        set available_beds = least(total_beds, available_beds + 1),
            availability_status = case when availability_status = 'hidden'::public.availability_status then 'available'::public.availability_status else availability_status end
        where id = new.property_id and rent_type = 'bed'::public.rent_type;
    elsif new.status in ('cancelled'::public.booking_status, 'rejected'::public.booking_status)
      and not exists (
        select 1 from public.bookings other_booking
        where other_booking.property_id = new.property_id
          and other_booking.id <> new.id
          and other_booking.status in ('owner_confirmed'::public.booking_status, 'student_confirmed'::public.booking_status)
      ) then
      perform set_config('app.property_lifecycle_operation', 'booking_reservation', true);
      update public.properties set availability_status = 'available'::public.availability_status
        where id = new.property_id and verification_status = 'verified'::public.verification_status and availability_status = 'reserved'::public.availability_status;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_property_viewing_reservation() from public, anon, authenticated;

commit;
