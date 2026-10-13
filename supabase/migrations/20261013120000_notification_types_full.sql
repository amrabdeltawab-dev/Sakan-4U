-- Replace the notifications_notification_type_check constraint with the full
-- list of 17 notification types. Safe to apply repeatedly (drop if exists + add).
-- DO NOT run automatically — founder applies manually in Supabase.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (
    notification_type IN (
      'booking_submitted',
      'booking_owner_responded',
      'booking_payment_confirmed',
      'viewing_scheduled',
      'viewing_cancelled',
      'viewing_completed',
      'student_decision_required',
      'booking_completed',
      'property_review',
      'owner_application',
      'staff_action_required',
      'viewing_reschedule_requested',
      'viewing_cancellation_requested',
      'viewing_no_show',
      'viewing_refund_decision',
      'owner_lead',
      'saved_search_match'
    )
  );
