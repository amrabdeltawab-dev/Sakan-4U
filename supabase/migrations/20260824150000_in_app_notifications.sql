begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'booking_submitted', 'booking_owner_responded', 'booking_payment_confirmed',
    'viewing_scheduled', 'viewing_cancelled', 'viewing_completed',
    'student_decision_required', 'booking_completed', 'property_review',
    'owner_application', 'staff_action_required'
  )),
  title text not null check (char_length(trim(title)) between 1 and 180),
  message text not null check (char_length(trim(message)) between 1 and 800),
  related_property_id uuid references public.properties(id) on delete set null,
  related_booking_id uuid references public.bookings(id) on delete set null,
  event_key text not null unique check (char_length(trim(event_key)) between 1 and 320),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists notifications_update_own_read_state on public.notifications;
create policy notifications_update_own_read_state on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function private.emit_notification(
  target_recipient_id uuid,
  target_type text,
  target_title text,
  target_message text,
  target_property_id uuid,
  target_booking_id uuid,
  target_event_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_recipient_id is null then return; end if;
  insert into public.notifications (
    recipient_id, notification_type, title, message,
    related_property_id, related_booking_id, event_key
  ) values (
    target_recipient_id, target_type, target_title, target_message,
    target_property_id, target_booking_id, target_event_key
  ) on conflict (event_key) do nothing;
end;
$$;

create or replace function private.notify_staff(
  target_type text,
  target_title text,
  target_message text,
  target_property_id uuid,
  target_booking_id uuid,
  target_event_prefix text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare staff_profile record;
begin
  for staff_profile in
    select id from public.profiles where role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  loop
    perform private.emit_notification(
      staff_profile.id, target_type, target_title, target_message,
      target_property_id, target_booking_id, target_event_prefix || ':staff:' || staff_profile.id::text
    );
  end loop;
end;
$$;

create or replace function private.notify_booking_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare property_record record;
declare appointment_label text;
begin
  select id, title, owner_id into property_record from public.properties where id = new.property_id;
  if not found then return new; end if;
  appointment_label := to_char(new.requested_viewing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');

  if tg_op = 'INSERT' then
    perform private.emit_notification(
      new.student_id, 'booking_submitted', 'تم إرسال طلب المعاينة',
      'استلمنا طلب معاينتك لعقار «' || property_record.title || '». ستصلك التحديثات هنا.',
      new.property_id, new.id, 'booking:' || new.id::text || ':submitted:student'
    );
    perform private.emit_notification(
      property_record.owner_id, 'booking_submitted', 'طلب معاينة جديد',
      'يوجد طلب معاينة جديد لعقار «' || property_record.title || '» بتاريخ ' || appointment_label || '.',
      new.property_id, new.id, 'booking:' || new.id::text || ':submitted:owner'
    );
    perform private.notify_staff(
      'booking_submitted', 'طلب معاينة جديد',
      'يوجد طلب معاينة جديد يحتاج المتابعة لعقار «' || property_record.title || '».',
      new.property_id, new.id, 'booking:' || new.id::text || ':submitted'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'contacted'::public.booking_status then
      perform private.emit_notification(
        new.student_id, 'booking_owner_responded', 'استجابة من مالك العقار',
        'بدأ مالك «' || property_record.title || '» متابعة طلب المعاينة.',
        new.property_id, new.id, 'booking:' || new.id::text || ':contacted:student'
      );
      perform private.notify_staff(
        'booking_owner_responded', 'استجابة مالك لطلب معاينة',
        'تغيرت متابعة المالك لطلب معاينة عقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':contacted'
      );
    elsif new.status = 'owner_confirmed'::public.booking_status then
      perform private.emit_notification(
        new.student_id, 'booking_owner_responded', 'تأكيد استعداد العقار للمعاينة',
        'أكد مالك «' || property_record.title || '» الاستعداد للمعاينة. ستتبعها تفاصيل التنسيق.',
        new.property_id, new.id, 'booking:' || new.id::text || ':owner-confirmed:student'
      );
      perform private.notify_staff(
        'booking_owner_responded', 'تأكيد مالك لطلب معاينة',
        'أكد المالك طلب معاينة لعقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':owner-confirmed'
      );
    elsif new.status = 'rejected'::public.booking_status then
      perform private.emit_notification(
        new.student_id, 'booking_owner_responded', 'تحديث طلب المعاينة',
        'تعذر إتمام طلب معاينة عقار «' || property_record.title || '». يمكنك متابعة خيارات سكن أخرى.',
        new.property_id, new.id, 'booking:' || new.id::text || ':rejected:student'
      );
      perform private.notify_staff(
        'staff_action_required', 'طلب معاينة لم يكتمل',
        'تم رفض طلب معاينة لعقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':rejected'
      );
    elsif new.status = 'cancelled'::public.booking_status then
      if auth.uid() is distinct from new.student_id then
        perform private.emit_notification(
          new.student_id, 'viewing_cancelled', 'تم إلغاء طلب المعاينة',
          'تم إلغاء طلب معاينة عقار «' || property_record.title || '».',
          new.property_id, new.id, 'booking:' || new.id::text || ':cancelled:student'
        );
      end if;
      if auth.uid() is distinct from property_record.owner_id then
        perform private.emit_notification(
          property_record.owner_id, 'viewing_cancelled', 'تم إلغاء طلب معاينة',
          'أُلغي طلب معاينة لعقار «' || property_record.title || '».',
          new.property_id, new.id, 'booking:' || new.id::text || ':cancelled:owner'
        );
      end if;
      perform private.notify_staff(
        'staff_action_required', 'إلغاء طلب معاينة',
        'أُلغي طلب معاينة لعقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':cancelled'
      );
    elsif new.status = 'student_confirmed'::public.booking_status then
      perform private.emit_notification(
        property_record.owner_id, 'booking_completed', 'تأكيد الطالب للخطوة التالية',
        'أكد الطالب الاستمرار بعد معاينة عقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':student-confirmed:owner'
      );
    elsif new.status = 'completed'::public.booking_status then
      perform private.emit_notification(
        new.student_id, 'booking_completed', 'اكتمل طلب السكن',
        'اكتمل طلب السكن المرتبط بعقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':completed:student'
      );
      perform private.emit_notification(
        property_record.owner_id, 'booking_completed', 'اكتمل طلب السكن',
        'اكتمل طلب السكن المرتبط بعقار «' || property_record.title || '».',
        new.property_id, new.id, 'booking:' || new.id::text || ':completed:owner'
      );
    end if;
  end if;

  if old.payment_status is distinct from new.payment_status and new.payment_status = 'paid'::public.viewing_payment_status then
    perform private.emit_notification(
      new.student_id, 'booking_payment_confirmed', 'تم تأكيد رسوم المعاينة',
      'أكد فريق ساكينو رسوم معاينة عقار «' || property_record.title || '».',
      new.property_id, new.id, 'booking:' || new.id::text || ':payment-paid:student'
    );
    perform private.notify_staff(
      'booking_payment_confirmed', 'تم تأكيد رسوم معاينة',
      'تم تأكيد رسوم طلب معاينة لعقار «' || property_record.title || '».',
      new.property_id, new.id, 'booking:' || new.id::text || ':payment-paid'
    );
    if new.status = 'owner_confirmed'::public.booking_status then
      perform private.notify_staff(
        'staff_action_required', 'طلب معاينة يحتاج جدولة',
        'طلب معاينة مدفوع ومؤكد لعقار «' || property_record.title || '» يحتاج تحديد الموعد.',
        new.property_id, new.id, 'booking:' || new.id::text || ':schedule-required'
      );
    end if;
  end if;

  if old.viewing_scheduled_at is distinct from new.viewing_scheduled_at and new.viewing_scheduled_at is not null then
    appointment_label := to_char(new.viewing_scheduled_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');
    perform private.emit_notification(
      new.student_id, 'viewing_scheduled', 'تم تحديد موعد المعاينة',
      'موعد معاينة عقار «' || property_record.title || '» هو ' || appointment_label || '.',
      new.property_id, new.id, 'booking:' || new.id::text || ':scheduled:' || new.viewing_scheduled_at::text || ':student'
    );
    perform private.emit_notification(
      property_record.owner_id, 'viewing_scheduled', 'تم تحديد موعد المعاينة',
      'تم تحديد موعد معاينة لعقار «' || property_record.title || '» في ' || appointment_label || '.',
      new.property_id, new.id, 'booking:' || new.id::text || ':scheduled:' || new.viewing_scheduled_at::text || ':owner'
    );
  end if;

  if old.viewing_completed_at is distinct from new.viewing_completed_at and new.viewing_completed_at is not null then
    perform private.emit_notification(
      new.student_id, 'viewing_completed', 'اكتملت المعاينة',
      'اكتملت معاينة عقار «' || property_record.title || '».',
      new.property_id, new.id, 'booking:' || new.id::text || ':viewing-completed:student'
    );
    perform private.emit_notification(
      new.student_id, 'student_decision_required', 'يلزم اتخاذ قرار بشأن العقار',
      'راجع عقار «' || property_record.title || '» وحدد قرارك بعد المعاينة.',
      new.property_id, new.id, 'booking:' || new.id::text || ':student-decision-required'
    );
    perform private.emit_notification(
      property_record.owner_id, 'viewing_completed', 'اكتملت معاينة للعقار',
      'اكتملت معاينة مرتبطة بعقار «' || property_record.title || '».',
      new.property_id, new.id, 'booking:' || new.id::text || ':viewing-completed:owner'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_emit_workflow_notifications on public.bookings;
create trigger bookings_emit_workflow_notifications
after insert or update of status, payment_status, viewing_scheduled_at, viewing_completed_at on public.bookings
for each row execute function private.notify_booking_workflow();

create or replace function private.notify_property_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_notification(
      new.owner_id, 'property_review', 'إعلانك قيد المراجعة',
      'تم استلام إعلان «' || new.title || '» وصوره للمراجعة.',
      new.id, null, 'property:' || new.id::text || ':submitted:owner'
    );
    perform private.notify_staff(
      'staff_action_required', 'عقار جديد ينتظر المراجعة',
      'يوجد إعلان جديد لعقار «' || new.title || '» يحتاج المراجعة.',
      new.id, null, 'property:' || new.id::text || ':submitted'
    );
    return new;
  end if;

  if old.verification_status is distinct from new.verification_status then
    if new.verification_status = 'verified'::public.verification_status then
      perform private.emit_notification(new.owner_id, 'property_review', 'تم اعتماد إعلانك', 'تم اعتماد إعلان «' || new.title || '» وسيظهر للطلاب وفق حالته المتاحة.', new.id, null, 'property:' || new.id::text || ':verified:' || coalesce(new.reviewed_at::text, new.updated_at::text));
    elsif new.verification_status = 'needs_changes'::public.verification_status then
      perform private.emit_notification(new.owner_id, 'property_review', 'تعديل مطلوب على إعلانك', 'يرجى مراجعة ملاحظة الإدارة على إعلان «' || new.title || '» ثم إعادة إرساله.', new.id, null, 'property:' || new.id::text || ':needs-changes:' || coalesce(new.reviewed_at::text, new.updated_at::text));
    elsif new.verification_status = 'rejected'::public.verification_status then
      perform private.emit_notification(new.owner_id, 'property_review', 'تم تحديث حالة إعلانك', 'تم رفض إعلان «' || new.title || '». راجع ملاحظة الإدارة لمعرفة الخطوة التالية.', new.id, null, 'property:' || new.id::text || ':rejected:' || coalesce(new.reviewed_at::text, new.updated_at::text));
    elsif new.verification_status = 'pending'::public.verification_status then
      perform private.emit_notification(new.owner_id, 'property_review', 'أعيد إرسال الإعلان للمراجعة', 'أُعيد إرسال إعلان «' || new.title || '» للمراجعة.', new.id, null, 'property:' || new.id::text || ':resubmitted:' || new.updated_at::text);
      perform private.notify_staff('staff_action_required', 'عقار أعيد إرساله للمراجعة', 'أُعيد إرسال إعلان «' || new.title || '» للمراجعة.', new.id, null, 'property:' || new.id::text || ':resubmitted:' || new.updated_at::text);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_emit_workflow_notifications on public.properties;
create trigger properties_emit_workflow_notifications
after insert or update of verification_status on public.properties
for each row execute function private.notify_property_workflow();

create or replace function private.notify_owner_application_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_staff(
      'owner_application', 'طلب اعتماد مالك جديد',
      'يوجد طلب اعتماد مالك جديد يحتاج المراجعة.',
      null, null, 'owner-application:' || new.id::text || ':submitted'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'approved'::public.owner_application_status then
      perform private.emit_notification(new.user_id, 'owner_application', 'تم اعتماد حساب المالك', 'تم اعتماد طلب حساب المالك الخاص بك. يمكنك الآن إدارة إعلاناتك.', null, null, 'owner-application:' || new.id::text || ':approved');
    elsif new.status = 'rejected'::public.owner_application_status then
      perform private.emit_notification(new.user_id, 'owner_application', 'تم تحديث طلب حساب المالك', 'لم يتم اعتماد طلب حساب المالك حالياً. راجع ملاحظة الإدارة إن وجدت.', null, null, 'owner-application:' || new.id::text || ':rejected');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists owner_applications_emit_workflow_notifications on public.owner_applications;
create trigger owner_applications_emit_workflow_notifications
after insert or update of status on public.owner_applications
for each row execute function private.notify_owner_application_workflow();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;

commit;
