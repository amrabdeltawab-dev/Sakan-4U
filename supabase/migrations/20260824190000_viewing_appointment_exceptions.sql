alter type public.booking_status add value if not exists 'no_show';

begin;

do $$ begin create type public.appointment_request_status as enum ('pending', 'confirmed', 'declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.viewing_no_show_party as enum ('student', 'owner', 'both'); exception when duplicate_object then null; end $$;
do $$ begin create type public.viewing_history_event_type as enum ('reschedule_requested', 'reschedule_confirmed', 'cancellation_requested', 'cancellation_confirmed', 'no_show_recorded', 'refund_review_opened', 'refund_approved', 'refund_declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.refund_review_status as enum ('not_required', 'pending', 'approved', 'declined'); exception when duplicate_object then null; end $$;

alter table public.booking_financials
  add column if not exists refund_review_status public.refund_review_status not null default 'not_required';

create table if not exists public.viewing_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  previous_viewing_at timestamptz not null,
  requested_viewing_at timestamptz not null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_role public.app_role not null,
  reason text not null check (char_length(trim(reason)) between 5 and 800),
  status public.appointment_request_status not null default 'pending',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  confirmed_viewing_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and resolved_at is null and resolved_by is null and confirmed_viewing_at is null) or (status <> 'pending' and resolved_at is not null and resolved_by is not null))
);

create unique index if not exists viewing_reschedule_one_pending_per_booking_idx
  on public.viewing_reschedule_requests (booking_id) where status = 'pending';
create index if not exists viewing_reschedule_booking_created_idx
  on public.viewing_reschedule_requests (booking_id, created_at desc);

create table if not exists public.viewing_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  previous_booking_status public.booking_status not null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_role public.app_role not null,
  reason text not null check (char_length(trim(reason)) between 5 and 800),
  status public.appointment_request_status not null default 'pending',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and resolved_at is null and resolved_by is null) or (status <> 'pending' and resolved_at is not null and resolved_by is not null))
);

create unique index if not exists viewing_cancellation_one_pending_per_booking_idx
  on public.viewing_cancellation_requests (booking_id) where status = 'pending';
create index if not exists viewing_cancellation_booking_created_idx
  on public.viewing_cancellation_requests (booking_id, created_at desc);

create table if not exists public.viewing_no_show_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  no_show_party public.viewing_no_show_party not null,
  reason text not null check (char_length(trim(reason)) between 5 and 800),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.booking_refund_decisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  decision public.refund_review_status not null check (decision in ('approved', 'declined')),
  amount integer check (amount is null or amount > 0),
  reason text not null check (char_length(trim(reason)) between 5 and 800),
  reference text check (reference is null or char_length(trim(reference)) between 3 and 180),
  approved_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  check ((decision = 'approved' and amount is not null and approved_by is not null) or (decision = 'declined' and amount is null and approved_by is not null))
);

create table if not exists public.viewing_operational_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type public.viewing_history_event_type not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  old_booking_status public.booking_status,
  new_booking_status public.booking_status,
  previous_viewing_at timestamptz,
  new_viewing_at timestamptz,
  reason text check (reason is null or char_length(trim(reason)) between 5 and 800),
  related_request_id uuid,
  related_refund_decision_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists viewing_operational_history_booking_created_idx
  on public.viewing_operational_history (booking_id, created_at desc);

alter table public.viewing_reschedule_requests enable row level security;
alter table public.viewing_cancellation_requests enable row level security;
alter table public.viewing_no_show_records enable row level security;
alter table public.booking_refund_decisions enable row level security;
alter table public.viewing_operational_history enable row level security;
revoke all on table public.viewing_reschedule_requests, public.viewing_cancellation_requests, public.viewing_no_show_records, public.booking_refund_decisions, public.viewing_operational_history from public, anon, authenticated;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'booking_submitted', 'booking_owner_responded', 'booking_payment_confirmed',
  'viewing_scheduled', 'viewing_cancelled', 'viewing_completed',
  'student_decision_required', 'booking_completed', 'property_review',
  'owner_application', 'staff_action_required', 'viewing_reschedule_requested',
  'viewing_cancellation_requested', 'viewing_no_show', 'viewing_refund_decision'
));

create or replace function private.assert_exception_reason(target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(target_reason, ''))) < 5 or char_length(trim(target_reason)) > 800 then
    raise exception 'اكتب سبباً واضحاً بين 5 و800 حرف.' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.open_manual_refund_review(target_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.booking_financials (booking_id, inspection_fee_amount, amount_paid, refund_status, refund_review_status)
  select b.id, b.fee_amount, b.fee_amount, 'pending'::public.refund_status, 'pending'::public.refund_review_status
  from public.bookings b where b.id = target_booking_id and b.payment_status = 'paid'::public.viewing_payment_status
  on conflict (booking_id) do update set
    refund_status = case when public.booking_financials.amount_paid > public.booking_financials.amount_refunded then 'pending'::public.refund_status else public.booking_financials.refund_status end,
    refund_review_status = case when public.booking_financials.amount_paid > public.booking_financials.amount_refunded then 'pending'::public.refund_review_status else public.booking_financials.refund_review_status end,
    updated_at = now();
end;
$$;

create or replace function private.assert_reschedule_access(target_booking public.bookings)
returns public.app_role language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  actor_role := private.current_user_role();
  if actor_role = 'student'::public.app_role and target_booking.student_id = auth.uid() then return actor_role; end if;
  if actor_role = 'owner'::public.app_role and private.owns_property(target_booking.property_id) then return actor_role; end if;
  raise exception 'Only the affected student or property owner may request this appointment change' using errcode = '42501';
end;
$$;

create or replace function public.request_viewing_reschedule(target_booking_id uuid, target_requested_viewing_at timestamptz, target_reason text)
returns public.viewing_reschedule_requests
language plpgsql security definer set search_path = '' as $$
declare booking_record public.bookings%rowtype; actor_role public.app_role; owner_id uuid; property_title text; created_request public.viewing_reschedule_requests%rowtype;
begin
  perform private.assert_exception_reason(target_reason);
  if target_requested_viewing_at <= now() then raise exception 'يجب أن يكون الموعد المقترح في المستقبل.' using errcode = '22007'; end if;
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  select p.owner_id, p.title into owner_id, property_title from public.properties p where p.id = booking_record.property_id;
  actor_role := private.assert_reschedule_access(booking_record);
  if booking_record.status <> 'owner_confirmed'::public.booking_status or booking_record.payment_status <> 'paid'::public.viewing_payment_status or booking_record.viewing_scheduled_at is null or booking_record.viewing_completed_at is not null then
    raise exception 'لا يمكن طلب تغيير الموعد في حالة المعاينة الحالية.' using errcode = 'P0002';
  end if;
  if target_requested_viewing_at = booking_record.viewing_scheduled_at then raise exception 'اختر موعداً مختلفاً عن الموعد الحالي.' using errcode = '22023'; end if;
  if exists (select 1 from public.viewing_reschedule_requests where booking_id = target_booking_id and status = 'pending'::public.appointment_request_status) then raise exception 'يوجد بالفعل طلب تغيير موعد قيد المراجعة.' using errcode = '23505'; end if;
  insert into public.viewing_reschedule_requests (booking_id, previous_viewing_at, requested_viewing_at, requested_by, requested_by_role, reason)
  values (target_booking_id, booking_record.viewing_scheduled_at, target_requested_viewing_at, auth.uid(), actor_role, trim(target_reason)) returning * into created_request;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, previous_viewing_at, new_viewing_at, reason, related_request_id)
  values (target_booking_id, 'reschedule_requested', auth.uid(), actor_role, booking_record.status, booking_record.status, booking_record.viewing_scheduled_at, target_requested_viewing_at, trim(target_reason), created_request.id);
  if actor_role = 'student'::public.app_role then
    perform private.emit_notification(owner_id, 'viewing_reschedule_requested', 'طلب تغيير موعد المعاينة', 'طلب الطالب تغيير موعد معاينة عقار «' || property_title || '». ستنسق الإدارة الموعد النهائي.', booking_record.property_id, target_booking_id, 'reschedule-request:' || created_request.id::text || ':owner');
  else
    perform private.emit_notification(booking_record.student_id, 'viewing_reschedule_requested', 'طلب تغيير موعد المعاينة', 'طلب مالك عقار «' || property_title || '» تغيير موعد المعاينة. ستنسق الإدارة الموعد النهائي.', booking_record.property_id, target_booking_id, 'reschedule-request:' || created_request.id::text || ':student');
  end if;
  perform private.notify_staff('viewing_reschedule_requested', 'طلب تغيير موعد معاينة', 'يوجد طلب تغيير موعد يحتاج اعتماد الإدارة لعقار «' || property_title || '».', booking_record.property_id, target_booking_id, 'reschedule-request:' || created_request.id::text);
  return created_request;
end;
$$;

create or replace function public.confirm_viewing_reschedule(target_request_id uuid, target_confirmed_viewing_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare request_record public.viewing_reschedule_requests%rowtype; booking_record public.bookings%rowtype; property_title text; updated_booking public.bookings%rowtype;
begin
  perform private.assert_staff_actor();
  if target_confirmed_viewing_at <= now() then raise exception 'يجب أن يكون الموعد المعتمد في المستقبل.' using errcode = '22007'; end if;
  select * into request_record from public.viewing_reschedule_requests where id = target_request_id for update;
  if not found or request_record.status <> 'pending'::public.appointment_request_status then raise exception 'طلب تغيير الموعد لم يعد متاحاً.' using errcode = 'P0002'; end if;
  select * into booking_record from public.bookings where id = request_record.booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  select p.title into property_title from public.properties p where p.id = booking_record.property_id;
  if booking_record.status <> 'owner_confirmed'::public.booking_status or booking_record.payment_status <> 'paid'::public.viewing_payment_status or booking_record.viewing_scheduled_at is null or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن اعتماد تغيير الموعد في حالة المعاينة الحالية.' using errcode = 'P0002'; end if;
  perform set_config('app.sakeno_booking_operation', 'reschedule_viewing', true);
  update public.bookings set viewing_scheduled_at = target_confirmed_viewing_at, viewing_scheduled_by = auth.uid() where id = booking_record.id returning * into updated_booking;
  update public.viewing_reschedule_requests set status = 'confirmed'::public.appointment_request_status, resolved_by = auth.uid(), resolved_at = now(), confirmed_viewing_at = target_confirmed_viewing_at where id = request_record.id;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, previous_viewing_at, new_viewing_at, reason, related_request_id)
  values (booking_record.id, 'reschedule_confirmed', auth.uid(), private.current_user_role(), booking_record.status, booking_record.status, booking_record.viewing_scheduled_at, target_confirmed_viewing_at, request_record.reason, request_record.id);
  perform private.notify_staff('staff_action_required', 'تم اعتماد تغيير موعد المعاينة', 'اعتمدت الإدارة موعداً جديداً لمعاينة عقار «' || property_title || '».', booking_record.property_id, booking_record.id, 'reschedule-confirmed:' || request_record.id::text);
  return updated_booking;
end;
$$;

create or replace function public.request_viewing_cancellation(target_booking_id uuid, target_reason text)
returns public.viewing_cancellation_requests
language plpgsql security definer set search_path = '' as $$
declare booking_record public.bookings%rowtype; actor_role public.app_role; owner_id uuid; property_title text; created_request public.viewing_cancellation_requests%rowtype;
begin
  perform private.assert_exception_reason(target_reason);
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  select p.owner_id, p.title into owner_id, property_title from public.properties p where p.id = booking_record.property_id;
  actor_role := private.assert_reschedule_access(booking_record);
  if booking_record.status not in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status) or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن طلب إلغاء المعاينة في حالتها الحالية.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.viewing_cancellation_requests where booking_id = target_booking_id and status = 'pending'::public.appointment_request_status) then raise exception 'يوجد بالفعل طلب إلغاء قيد المراجعة.' using errcode = '23505'; end if;
  insert into public.viewing_cancellation_requests (booking_id, previous_booking_status, requested_by, requested_by_role, reason)
  values (target_booking_id, booking_record.status, auth.uid(), actor_role, trim(target_reason)) returning * into created_request;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason, related_request_id)
  values (target_booking_id, 'cancellation_requested', auth.uid(), actor_role, booking_record.status, booking_record.status, trim(target_reason), created_request.id);
  if actor_role = 'student'::public.app_role then
    perform private.emit_notification(owner_id, 'viewing_cancellation_requested', 'طلب إلغاء المعاينة', 'طلب الطالب إلغاء معاينة عقار «' || property_title || '». ستراجع الإدارة الطلب.', booking_record.property_id, target_booking_id, 'cancellation-request:' || created_request.id::text || ':owner');
  else
    perform private.emit_notification(booking_record.student_id, 'viewing_cancellation_requested', 'طلب إلغاء المعاينة', 'طلب مالك عقار «' || property_title || '» إلغاء المعاينة. ستراجع الإدارة الطلب.', booking_record.property_id, target_booking_id, 'cancellation-request:' || created_request.id::text || ':student');
  end if;
  perform private.notify_staff('viewing_cancellation_requested', 'طلب إلغاء معاينة', 'يوجد طلب إلغاء يحتاج مراجعة الإدارة لعقار «' || property_title || '».', booking_record.property_id, target_booking_id, 'cancellation-request:' || created_request.id::text);
  return created_request;
end;
$$;

create or replace function private.apply_viewing_cancellation(target_request_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare request_record public.viewing_cancellation_requests%rowtype; booking_record public.bookings%rowtype; updated_booking public.bookings%rowtype;
begin
  select * into request_record from public.viewing_cancellation_requests where id = target_request_id for update;
  if not found or request_record.status <> 'pending'::public.appointment_request_status then raise exception 'طلب الإلغاء لم يعد متاحاً.' using errcode = 'P0002'; end if;
  select * into booking_record from public.bookings where id = request_record.booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  if booking_record.status not in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status) or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن اعتماد الإلغاء في حالة المعاينة الحالية.' using errcode = 'P0002'; end if;
  perform set_config('app.sakeno_booking_operation', 'cancel_viewing', true);
  update public.bookings set status = 'cancelled'::public.booking_status where id = booking_record.id returning * into updated_booking;
  update public.viewing_cancellation_requests set status = 'confirmed'::public.appointment_request_status, resolved_by = auth.uid(), resolved_at = now() where id = request_record.id;
  if updated_booking.payment_status = 'paid'::public.viewing_payment_status then
    perform private.open_manual_refund_review(updated_booking.id);
    insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason, related_request_id)
    values (updated_booking.id, 'refund_review_opened', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, 'يتطلب الإلغاء قرار استرداد يدوي.', request_record.id);
    perform private.notify_staff('staff_action_required', 'قرار استرداد يدوي مطلوب', 'إلغاء معاينة مدفوعة يحتاج قراراً مالياً يدوياً.', updated_booking.property_id, updated_booking.id, 'refund-review:' || request_record.id::text);
  end if;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason, related_request_id)
  values (updated_booking.id, 'cancellation_confirmed', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, request_record.reason, request_record.id);
  return updated_booking;
end;
$$;

create or replace function public.confirm_viewing_cancellation(target_request_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff_actor();
  return private.apply_viewing_cancellation(target_request_id);
end;
$$;

create or replace function public.record_viewing_no_show(target_booking_id uuid, target_party public.viewing_no_show_party, target_reason text)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare booking_record public.bookings%rowtype; updated_booking public.bookings%rowtype; owner_id uuid; property_title text; no_show_id uuid;
begin
  perform private.assert_staff_actor(); perform private.assert_exception_reason(target_reason);
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  select p.owner_id, p.title into owner_id, property_title from public.properties p where p.id = booking_record.property_id;
  if booking_record.status <> 'owner_confirmed'::public.booking_status or booking_record.payment_status <> 'paid'::public.viewing_payment_status or booking_record.viewing_scheduled_at is null or booking_record.viewing_scheduled_at > now() or booking_record.viewing_completed_at is not null then raise exception 'لا يمكن تسجيل عدم حضور قبل الموعد أو بعد إتمام المعاينة.' using errcode = 'P0002'; end if;
  perform set_config('app.sakeno_booking_operation', 'record_no_show', true);
  update public.bookings set status = 'no_show'::public.booking_status where id = booking_record.id returning * into updated_booking;
  insert into public.viewing_no_show_records (booking_id, no_show_party, reason, recorded_by) values (target_booking_id, target_party, trim(target_reason), auth.uid()) returning id into no_show_id;
  perform private.open_manual_refund_review(updated_booking.id);
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, previous_viewing_at, reason, related_request_id)
  values (updated_booking.id, 'no_show_recorded', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, booking_record.viewing_scheduled_at, trim(target_reason), no_show_id);
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason, related_request_id)
  values (updated_booking.id, 'refund_review_opened', auth.uid(), private.current_user_role(), booking_record.status, updated_booking.status, 'تتطلب حالة عدم الحضور قرار استرداد يدوي.', no_show_id);
  perform private.emit_notification(booking_record.student_id, 'viewing_no_show', 'تم تسجيل حالة عدم حضور', 'سجلت الإدارة حالة عدم حضور لمعاينة عقار «' || property_title || '». ستراجع الإدارة أي قرار مالي يدوياً عند الحاجة.', updated_booking.property_id, updated_booking.id, 'no-show:' || no_show_id::text || ':student');
  perform private.emit_notification(owner_id, 'viewing_no_show', 'تم تسجيل حالة عدم حضور', 'سجلت الإدارة حالة عدم حضور لمعاينة عقار «' || property_title || '».', updated_booking.property_id, updated_booking.id, 'no-show:' || no_show_id::text || ':owner');
  perform private.notify_staff('viewing_no_show', 'حالة عدم حضور مسجلة', 'سجلت حالة عدم حضور لمعاينة عقار «' || property_title || '» وتحتاج متابعة تشغيلية ومالية.', updated_booking.property_id, updated_booking.id, 'no-show:' || no_show_id::text);
  return updated_booking;
end;
$$;

create or replace function public.record_manual_refund_decision(target_booking_id uuid, target_decision public.refund_review_status, target_amount integer, target_reason text, target_reference text default null)
returns public.booking_financials language plpgsql security definer set search_path = '' as $$
declare financial_record public.booking_financials%rowtype; booking_record public.bookings%rowtype; updated_financial public.booking_financials%rowtype; decision_id uuid; property_title text;
begin
  perform private.assert_staff_actor(); perform private.assert_exception_reason(target_reason);
  if target_decision not in ('approved'::public.refund_review_status, 'declined'::public.refund_review_status) then raise exception 'يلزم اختيار اعتماد أو رفض قرار الاسترداد.' using errcode = '22023'; end if;
  select * into booking_record from public.bookings where id = target_booking_id for update;
  if not found then raise exception 'طلب المعاينة غير موجود.' using errcode = 'P0002'; end if;
  select p.title into property_title from public.properties p where p.id = booking_record.property_id;
  select * into financial_record from public.booking_financials where booking_id = target_booking_id for update;
  if not found or financial_record.refund_review_status <> 'pending'::public.refund_review_status then raise exception 'لا توجد حالة استرداد يدوية معلقة لهذا الطلب.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.booking_refund_decisions where booking_id = target_booking_id) then raise exception 'تم تسجيل قرار استرداد نهائي لهذا الطلب.' using errcode = '23505'; end if;
  if target_decision = 'approved'::public.refund_review_status then
    if target_amount is null or target_amount <= 0 or target_amount > financial_record.amount_paid - financial_record.amount_refunded then raise exception 'مبلغ الاسترداد يجب أن يكون ضمن الرصيد المسدد غير المسترد.' using errcode = '22023'; end if;
    if target_reference is not null and char_length(trim(target_reference)) < 3 then raise exception 'مرجع الاسترداد غير صالح.' using errcode = '22023'; end if;
  elsif target_amount is not null then raise exception 'لا يحدد مبلغ عند رفض قرار الاسترداد.' using errcode = '22023'; end if;
  insert into public.booking_refund_decisions (booking_id, decision, amount, reason, reference, approved_by) values (target_booking_id, target_decision, case when target_decision = 'approved'::public.refund_review_status then target_amount else null end, trim(target_reason), nullif(trim(coalesce(target_reference, '')), ''), auth.uid()) returning id into decision_id;
  update public.booking_financials set
    amount_refunded = case when target_decision = 'approved'::public.refund_review_status then amount_refunded + target_amount else amount_refunded end,
    refund_status = case when target_decision = 'approved'::public.refund_review_status then 'refunded'::public.refund_status else 'not_requested'::public.refund_status end,
    refund_review_status = target_decision,
    updated_at = now()
  where booking_id = target_booking_id returning * into updated_financial;
  insert into public.viewing_operational_history (booking_id, event_type, actor_id, actor_role, old_booking_status, new_booking_status, reason, related_refund_decision_id)
  values (target_booking_id, case when target_decision = 'approved'::public.refund_review_status then 'refund_approved'::public.viewing_history_event_type else 'refund_declined'::public.viewing_history_event_type end, auth.uid(), private.current_user_role(), booking_record.status, booking_record.status, trim(target_reason), decision_id);
  perform private.emit_notification(booking_record.student_id, 'viewing_refund_decision', case when target_decision = 'approved'::public.refund_review_status then 'تم اعتماد قرار استرداد يدوي' else 'تم تسجيل قرار الاسترداد' end, case when target_decision = 'approved'::public.refund_review_status then 'سجلت الإدارة قرار استرداد يدوي لرسوم معاينة عقار «' || property_title || '».' else 'راجعت الإدارة حالة رسوم معاينة عقار «' || property_title || '» ولم تعتمد استرداداً.' end, booking_record.property_id, target_booking_id, 'refund-decision:' || decision_id::text || ':student');
  perform private.notify_staff('viewing_refund_decision', 'قرار استرداد يدوي', 'سجل قرار استرداد يدوي لطلب معاينة عقار «' || property_title || '».', booking_record.property_id, target_booking_id, 'refund-decision:' || decision_id::text);
  return updated_financial;
end;
$$;

create or replace function private.enforce_booking_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role; operation text := coalesce(current_setting('app.sakeno_booking_operation', true), '');
begin
  if tg_op = 'INSERT' then
    if operation <> 'create_viewing_request' or auth.uid() is null or private.current_user_role() is distinct from 'student'::public.app_role or new.student_id is distinct from auth.uid() or new.status is distinct from 'pending'::public.booking_status or new.payment_status is distinct from 'pending'::public.viewing_payment_status or new.fee_amount is null or new.requested_viewing_at < now() then raise exception 'Only the authenticated student may create a pending viewing request' using errcode = '42501'; end if;
    return new;
  end if;
  if old.id is distinct from new.id or old.property_id is distinct from new.property_id or old.student_id is distinct from new.student_id or old.contact_name is distinct from new.contact_name or old.phone is distinct from new.phone or old.people_count is distinct from new.people_count or old.preferred_contact_time is distinct from new.preferred_contact_time or old.notes is distinct from new.notes or old.requested_viewing_at is distinct from new.requested_viewing_at or old.fee_amount is distinct from new.fee_amount or old.created_at is distinct from new.created_at then raise exception 'Viewing request details are immutable after creation' using errcode = '42501'; end if;
  actor_role := private.current_user_role();
  if operation = 'record_payment' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'pending'::public.viewing_payment_status or new.payment_status <> 'paid'::public.viewing_payment_status or new.paid_at is null or new.payment_recorded_by is distinct from auth.uid() or old.status is distinct from new.status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may record a verified viewing-fee payment' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'schedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_scheduled_at is not null or new.viewing_scheduled_at is null or new.viewing_scheduled_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may schedule a paid owner-confirmed viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'reschedule_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_scheduled_at is null or old.viewing_completed_at is not null or new.viewing_scheduled_at is null or new.viewing_scheduled_at <= now() or new.viewing_scheduled_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may reschedule an incomplete paid viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'cancel_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.status not in ('pending'::public.booking_status, 'contacted'::public.booking_status, 'owner_confirmed'::public.booking_status) or old.viewing_completed_at is not null or new.status <> 'cancelled'::public.booking_status or old.payment_status is distinct from new.payment_status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may confirm a reasoned pre-completion cancellation' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'record_no_show' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.status <> 'owner_confirmed'::public.booking_status or old.payment_status <> 'paid'::public.viewing_payment_status or old.viewing_scheduled_at is null or old.viewing_scheduled_at > now() or old.viewing_completed_at is not null or new.status <> 'no_show'::public.booking_status or old.payment_status is distinct from new.payment_status or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_completed_at is distinct from new.viewing_completed_at or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may record a missed scheduled viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'complete_viewing' then
    if actor_role not in ('admin'::public.app_role, 'super_admin'::public.app_role) or old.payment_status <> 'paid'::public.viewing_payment_status or old.viewing_scheduled_at is null or old.viewing_completed_at is not null or new.viewing_completed_at is null or new.viewing_completed_by is distinct from auth.uid() or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Only staff may complete a scheduled viewing' using errcode = '42501'; end if; return new;
  end if;
  if operation = 'student_decision' then
    if actor_role <> 'student'::public.app_role or old.student_id <> auth.uid() or old.payment_status <> 'paid'::public.viewing_payment_status or old.status <> 'owner_confirmed'::public.booking_status or old.viewing_completed_at is null or old.student_viewing_decision <> 'pending'::public.student_viewing_decision or not ((new.student_viewing_decision = 'accepted'::public.student_viewing_decision and new.status = 'student_confirmed'::public.booking_status and new.fee_credit_status = 'credited'::public.viewing_fee_credit_status and new.fee_credited_at is not null) or (new.student_viewing_decision = 'rejected'::public.student_viewing_decision and new.status = 'cancelled'::public.booking_status and new.fee_credit_status = 'not_credited'::public.viewing_fee_credit_status and new.fee_credited_at is null)) then raise exception 'The student viewing decision is not allowed for this request' using errcode = '42501'; end if; return new;
  end if;
  if operation <> 'transition' then raise exception 'Booking updates must use an authorized workflow operation' using errcode = '42501'; end if;
  if old.payment_status is distinct from new.payment_status or old.paid_at is distinct from new.paid_at or old.payment_recorded_by is distinct from new.payment_recorded_by or old.viewing_scheduled_at is distinct from new.viewing_scheduled_at or old.viewing_scheduled_by is distinct from new.viewing_scheduled_by or old.viewing_completed_at is distinct from new.viewing_completed_at or old.viewing_completed_by is distinct from new.viewing_completed_by or old.student_viewing_decision is distinct from new.student_viewing_decision or old.fee_credit_status is distinct from new.fee_credit_status or old.fee_credited_at is distinct from new.fee_credited_at then raise exception 'Payment and viewing fields require an authorized workflow operation' using errcode = '42501'; end if;
  if old.status is not distinct from new.status then return new; end if;
  if auth.uid() is null then raise exception 'Authentication is required to transition a booking' using errcode = '42501'; end if;
  if actor_role = 'owner'::public.app_role and private.owns_property(old.property_id) and ((old.status = 'pending'::public.booking_status and new.status in ('contacted'::public.booking_status, 'rejected'::public.booking_status)) or (old.status = 'contacted'::public.booking_status and new.status in ('owner_confirmed'::public.booking_status, 'rejected'::public.booking_status))) then return new; end if;
  if actor_role in ('admin'::public.app_role, 'super_admin'::public.app_role) and old.status = 'student_confirmed'::public.booking_status and new.status = 'completed'::public.booking_status then return new; end if;
  raise exception 'Booking status transition from % to % is not allowed for this role', old.status, new.status using errcode = '42501';
end;
$$;

create or replace function public.list_student_viewing_requests()
returns setof jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status, 'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount, 'paymentStatus', b.payment_status, 'paidAt', b.paid_at, 'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status, 'feeCreditedAt', b.fee_credited_at, 'notes', b.notes, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'refundStatus', f.refund_status, 'refundReviewStatus', f.refund_review_status, 'amountPaid', f.amount_paid, 'amountRefunded', f.amount_refunded, 'amountCreditedTowardFinal', f.amount_credited_toward_final, 'amountDue', f.amount_due, 'finalSettlementStatus', f.final_settlement_status,
    'rescheduleRequest', (select jsonb_build_object('status', r.status, 'requestedViewingAt', r.requested_viewing_at, 'previousViewingAt', r.previous_viewing_at, 'reason', r.reason, 'createdAt', r.created_at, 'confirmedViewingAt', r.confirmed_viewing_at) from public.viewing_reschedule_requests r where r.booking_id = b.id order by r.created_at desc limit 1),
    'cancellationRequest', (select jsonb_build_object('status', c.status, 'reason', c.reason, 'createdAt', c.created_at) from public.viewing_cancellation_requests c where c.booking_id = b.id order by c.created_at desc limit 1),
    'noShow', (select jsonb_build_object('party', n.no_show_party, 'reason', n.reason, 'recordedAt', n.recorded_at) from public.viewing_no_show_records n where n.booking_id = b.id),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'governorate', p.governorate, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity, 'availabilityStatus', p.availability_status, 'verificationStatus', p.verification_status)
  ) from public.bookings b join public.properties p on p.id = b.property_id left join public.booking_financials f on f.booking_id = b.id where b.student_id = auth.uid() and private.current_user_role() = 'student'::public.app_role order by b.updated_at desc;
$$;

create or replace function public.list_owner_viewing_requests()
returns setof jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'propertyId', b.property_id, 'status', b.status, 'requestedViewingAt', b.requested_viewing_at, 'feeAmount', b.fee_amount, 'paymentStatus', b.payment_status, 'viewingScheduledAt', b.viewing_scheduled_at, 'viewingCompletedAt', b.viewing_completed_at, 'studentViewingDecision', b.student_viewing_decision, 'feeCreditStatus', b.fee_credit_status, 'peopleCount', b.people_count, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'rescheduleRequest', (select jsonb_build_object('status', r.status, 'requestedViewingAt', r.requested_viewing_at, 'createdAt', r.created_at, 'requestedByRole', r.requested_by_role, 'reason', case when r.requested_by = auth.uid() then r.reason else null end, 'confirmedViewingAt', r.confirmed_viewing_at) from public.viewing_reschedule_requests r where r.booking_id = b.id order by r.created_at desc limit 1),
    'cancellationRequest', (select jsonb_build_object('status', c.status, 'createdAt', c.created_at, 'requestedByRole', c.requested_by_role, 'reason', case when c.requested_by = auth.uid() then c.reason else null end) from public.viewing_cancellation_requests c where c.booking_id = b.id order by c.created_at desc limit 1),
    'noShow', (select jsonb_build_object('party', n.no_show_party, 'recordedAt', n.recorded_at) from public.viewing_no_show_records n where n.booking_id = b.id),
    'interestedStudentMessage', concat('طالب مهتم بالعقار ', p.title, ' وطلب معاينة في ', to_char(b.requested_viewing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city)
  ) from public.bookings b join public.properties p on p.id = b.property_id where private.current_user_role() = 'owner'::public.app_role and private.owns_property(b.property_id) order by b.updated_at desc;
$$;

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
    'property', jsonb_build_object('id', p.id, 'title', p.title, 'area', p.area, 'city', p.city, 'approximateLocation', p.approximate_location, 'monthlyPrice', p.monthly_price, 'capacity', p.capacity)
  ) from public.bookings b join public.properties p on p.id = b.property_id join public.profiles student on student.id = b.student_id left join public.booking_financials f on f.booking_id = b.id where private.is_staff() order by b.updated_at desc;
$$;

revoke all on function private.assert_exception_reason(text), private.open_manual_refund_review(uuid), private.assert_reschedule_access(public.bookings), private.apply_viewing_cancellation(uuid) from public, anon, authenticated;
revoke all on function public.request_viewing_reschedule(uuid, timestamptz, text), public.confirm_viewing_reschedule(uuid, timestamptz), public.request_viewing_cancellation(uuid, text), public.confirm_viewing_cancellation(uuid), public.record_viewing_no_show(uuid, public.viewing_no_show_party, text), public.record_manual_refund_decision(uuid, public.refund_review_status, integer, text, text) from public, anon;
grant execute on function public.request_viewing_reschedule(uuid, timestamptz, text), public.confirm_viewing_reschedule(uuid, timestamptz), public.request_viewing_cancellation(uuid, text), public.confirm_viewing_cancellation(uuid), public.record_viewing_no_show(uuid, public.viewing_no_show_party, text), public.record_manual_refund_decision(uuid, public.refund_review_status, integer, text, text) to authenticated;

commit;
