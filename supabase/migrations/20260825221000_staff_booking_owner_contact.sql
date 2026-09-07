begin;

create or replace function public.list_staff_viewing_requests()
returns setof jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'studentId', b.student_id, 'status', b.status, 'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount, 'paymentStatus', b.payment_status, 'paidAt', b.paid_at, 'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status, 'feeCreditedAt', b.fee_credited_at, 'notes', b.notes, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'refundStatus', f.refund_status, 'refundReviewStatus', f.refund_review_status, 'amountPaid', f.amount_paid, 'amountRefunded', f.amount_refunded, 'amountCreditedTowardFinal', f.amount_credited_toward_final, 'amountDue', f.amount_due, 'finalSettlementStatus', f.final_settlement_status,
    'rescheduleRequest', (select jsonb_build_object('id', r.id, 'status', r.status, 'previousViewingAt', r.previous_viewing_at, 'requestedViewingAt', r.requested_viewing_at, 'requestedByRole', r.requested_by_role, 'reason', r.reason, 'createdAt', r.created_at, 'confirmedViewingAt', r.confirmed_viewing_at) from public.viewing_reschedule_requests r where r.booking_id = b.id order by r.created_at desc limit 1),
    'cancellationRequest', (select jsonb_build_object('id', c.id, 'status', c.status, 'previousBookingStatus', c.previous_booking_status, 'requestedByRole', c.requested_by_role, 'reason', c.reason, 'createdAt', c.created_at) from public.viewing_cancellation_requests c where c.booking_id = b.id order by c.created_at desc limit 1),
    'noShow', (select jsonb_build_object('id', n.id, 'party', n.no_show_party, 'reason', n.reason, 'recordedAt', n.recorded_at) from public.viewing_no_show_records n where n.booking_id = b.id),
    'refundDecision', (select jsonb_build_object('id', d.id, 'decision', d.decision, 'amount', d.amount, 'reason', d.reason, 'reference', d.reference, 'decidedAt', d.decided_at) from public.booking_refund_decisions d where d.booking_id = b.id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('eventType', h.event_type, 'actorRole', h.actor_role, 'oldStatus', h.old_booking_status, 'newStatus', h.new_booking_status, 'previousViewingAt', h.previous_viewing_at, 'newViewingAt', h.new_viewing_at, 'reason', h.reason, 'createdAt', h.created_at) order by h.created_at asc) from public.viewing_operational_history h where h.booking_id = b.id), '[]'::jsonb),
    'studentContact', jsonb_build_object('name', b.contact_name, 'phone', b.phone, 'email', student.email),
    'ownerContact', jsonb_build_object('name', owner.full_name, 'phone', owner.phone, 'email', owner.email),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  join public.profiles student on student.id = b.student_id
  join public.profiles owner on owner.id = p.owner_id
  left join public.booking_financials f on f.booking_id = b.id
  where private.is_staff()
  order by b.updated_at desc;
$$;

revoke all on function public.list_staff_viewing_requests() from public, anon;
grant execute on function public.list_staff_viewing_requests() to authenticated;

commit;
