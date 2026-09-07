-- Preserve the owner-submitted description for internal review when staff redact the publishable description.
alter table public.properties add column if not exists owner_description text;

update public.properties
set owner_description = description
where owner_description is null;

alter table public.properties alter column owner_description set not null;

create or replace function private.capture_owner_property_description()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_description := coalesce(new.owner_description, new.description);
  elsif new.description is distinct from old.description
    and auth.uid() = old.owner_id then
    new.owner_description := new.description;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_capture_owner_description on public.properties;
create trigger properties_capture_owner_description
before insert or update of description on public.properties
for each row execute function private.capture_owner_property_description();

revoke all on function private.capture_owner_property_description() from public, anon, authenticated;
