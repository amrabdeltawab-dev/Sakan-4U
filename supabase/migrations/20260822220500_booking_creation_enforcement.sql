begin;

create or replace function private.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null
       or private.current_user_role() is distinct from 'student'::public.app_role
       or new.student_id is distinct from auth.uid()
       or new.status is distinct from 'pending'::public.booking_status then
      raise exception 'Only the authenticated student may create a pending booking'
        using errcode = '42501';
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
     or old.created_at is distinct from new.created_at then
    raise exception 'Booking details are immutable after creation'
      using errcode = '42501';
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication is required to transition a booking'
      using errcode = '42501';
  end if;

  actor_role := private.current_user_role();

  if actor_role = 'student'::public.app_role
     and old.student_id = auth.uid()
     and (
       (old.status = 'pending'::public.booking_status and new.status = 'cancelled'::public.booking_status)
       or (old.status = 'contacted'::public.booking_status and new.status = 'cancelled'::public.booking_status)
       or (old.status = 'owner_confirmed'::public.booking_status and new.status in ('student_confirmed'::public.booking_status, 'cancelled'::public.booking_status))
     ) then
    return new;
  end if;

  if actor_role = 'owner'::public.app_role
     and private.owns_property(old.property_id)
     and (
       (old.status = 'pending'::public.booking_status and new.status in ('contacted'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status))
       or (old.status = 'contacted'::public.booking_status and new.status in ('owner_confirmed'::public.booking_status, 'rejected'::public.booking_status, 'cancelled'::public.booking_status))
     ) then
    return new;
  end if;

  if actor_role in ('admin'::public.app_role, 'super_admin'::public.app_role)
     and old.status = 'student_confirmed'::public.booking_status
     and new.status = 'completed'::public.booking_status then
    return new;
  end if;

  raise exception 'Booking status transition from % to % is not allowed for this role', old.status, new.status
    using errcode = '42501';
end;
$$;

drop trigger if exists bookings_enforce_transition on public.bookings;
create trigger bookings_enforce_transition
before insert or update on public.bookings
for each row execute procedure private.enforce_booking_transition();

commit;
