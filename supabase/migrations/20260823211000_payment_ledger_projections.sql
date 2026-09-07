begin;

create or replace function public.list_student_viewing_requests()
returns setof jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status,
    'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount,
    'paymentStatus', b.payment_status, 'paidAt', b.paid_at,
    'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at,
    'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status,
    'feeCreditedAt', b.fee_credited_at, 'amountPaid', f.amount_paid,
    'amountCreditedTowardFinal', f.amount_credited_toward_final, 'amountDue', f.amount_due,
    'refundStatus', f.refund_status, 'finalSettlementStatus', f.final_settlement_status,
    'notes', b.notes, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'governorate', p.governorate, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity, 'availabilityStatus', p.availability_status, 'verificationStatus', p.verification_status)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  left join public.booking_financials f on f.booking_id = b.id
  where b.student_id = auth.uid() and private.current_user_role() = 'student'::public.app_role
  order by b.updated_at desc;
$$;

create or replace function public.list_staff_viewing_requests()
returns setof jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'studentId', b.student_id, 'status', b.status,
    'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount,
    'paymentStatus', b.payment_status, 'paidAt', b.paid_at,
    'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at,
    'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status,
    'feeCreditedAt', b.fee_credited_at, 'amountPaid', f.amount_paid,
    'amountCreditedTowardFinal', f.amount_credited_toward_final, 'amountDue', f.amount_due,
    'refundStatus', f.refund_status, 'finalSettlementStatus', f.final_settlement_status,
    'manualPaymentReference', (select t.provider_reference from public.booking_payment_transactions t where t.booking_id = b.id and t.transaction_type = 'inspection_fee' and t.status = 'verified' order by t.created_at desc limit 1),
    'notes', b.notes, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'studentContact', jsonb_build_object('name', b.contact_name, 'phone', b.phone, 'email', student.email),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id
  join public.profiles student on student.id = b.student_id
  left join public.booking_financials f on f.booking_id = b.id
  where private.is_staff()
  order by b.updated_at desc;
$$;

commit;
