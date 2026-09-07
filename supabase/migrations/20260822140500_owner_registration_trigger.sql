begin;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'desired_role', 'student');
  owner_request jsonb := coalesce(new.raw_user_meta_data -> 'owner_request', '{}'::jsonb);
  requested_phone text := nullif(trim(owner_request ->> 'phone'), '');
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), coalesce(new.email, 'مستخدم جديد')),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  if requested_role = 'owner' and requested_phone is not null and char_length(requested_phone) between 6 and 32 then
    insert into public.owner_applications (user_id, phone, onboarding_data, status)
    values (new.id, requested_phone, owner_request, 'pending'::public.owner_application_status)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

commit;
