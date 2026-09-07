begin;

revoke all on function private.emit_notification(uuid, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.notify_staff(text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.notify_booking_workflow() from public, anon, authenticated;
revoke all on function private.notify_property_workflow() from public, anon, authenticated;
revoke all on function private.notify_owner_application_workflow() from public, anon, authenticated;

commit;
