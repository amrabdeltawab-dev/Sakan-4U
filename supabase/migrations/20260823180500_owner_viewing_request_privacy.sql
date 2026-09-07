begin;

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

revoke all on function public.list_owner_viewing_requests() from public, anon;
grant execute on function public.list_owner_viewing_requests() to authenticated;

commit;
