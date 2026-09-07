begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  booking_updates boolean not null default true,
  property_updates boolean not null default true,
  owner_application_updates boolean not null default true,
  general_account_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (user_id, booking_updates, property_updates, owner_application_updates, general_account_updates) on public.notification_preferences to authenticated;
grant update (booking_updates, property_updates, owner_application_updates, general_account_updates, updated_at) on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function private.notification_category(target_type text)
returns text language sql immutable security definer set search_path = '' as $$
  select case
    when target_type in (
      'booking_submitted', 'booking_owner_responded', 'booking_payment_confirmed',
      'viewing_scheduled', 'viewing_cancelled', 'viewing_completed',
      'student_decision_required', 'booking_completed', 'viewing_reschedule_requested',
      'viewing_cancellation_requested', 'viewing_no_show', 'viewing_refund_decision'
    ) then 'booking_updates'
    when target_type = 'property_review' then 'property_updates'
    when target_type = 'owner_application' then 'owner_application_updates'
    else 'general_account_updates'
  end;
$$;

create or replace function private.notification_delivery_enabled(target_recipient_id uuid, target_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare preferences public.notification_preferences%rowtype; category text;
begin
  -- Alerts that represent a staff action requirement remain mandatory.
  if target_type = 'staff_action_required' then return true; end if;
  select * into preferences from public.notification_preferences where user_id = target_recipient_id;
  if not found then return true; end if;
  category := private.notification_category(target_type);
  return case category
    when 'booking_updates' then preferences.booking_updates
    when 'property_updates' then preferences.property_updates
    when 'owner_application_updates' then preferences.owner_application_updates
    else preferences.general_account_updates
  end;
end;
$$;

create or replace function private.emit_notification(
  target_recipient_id uuid,
  target_type text,
  target_title text,
  target_message text,
  target_property_id uuid,
  target_booking_id uuid,
  target_event_key text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_recipient_id is null or not private.notification_delivery_enabled(target_recipient_id, target_type) then return; end if;
  insert into public.notifications (
    recipient_id, notification_type, title, message,
    related_property_id, related_booking_id, event_key
  ) values (
    target_recipient_id, target_type, target_title, target_message,
    target_property_id, target_booking_id, target_event_key
  ) on conflict (event_key) do nothing;
end;
$$;

create or replace function private.set_notification_preferences_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute procedure private.set_notification_preferences_updated_at();

revoke all on function private.notification_category(text), private.notification_delivery_enabled(uuid, text), private.emit_notification(uuid, text, text, text, uuid, uuid, text), private.set_notification_preferences_updated_at() from public, anon, authenticated;

commit;
