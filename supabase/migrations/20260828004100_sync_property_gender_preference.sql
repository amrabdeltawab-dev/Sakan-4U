begin;

create or replace function private.sync_property_gender_preference()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.gender_preference = 'anyone'::public.gender_preference and new.gender_suitability <> 'mixed'::public.gender_suitability then
      new.gender_preference := new.gender_suitability::text::public.gender_preference;
    else
      new.gender_suitability := case when new.gender_preference = 'anyone'::public.gender_preference then 'mixed'::public.gender_suitability else new.gender_preference::text::public.gender_suitability end;
    end if;
  elsif new.gender_preference is distinct from old.gender_preference then
    new.gender_suitability := case when new.gender_preference = 'anyone'::public.gender_preference then 'mixed'::public.gender_suitability else new.gender_preference::text::public.gender_suitability end;
  elsif new.gender_suitability is distinct from old.gender_suitability then
    new.gender_preference := case when new.gender_suitability = 'mixed'::public.gender_suitability then 'anyone'::public.gender_preference else new.gender_suitability::text::public.gender_preference end;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_property_gender_preference on public.properties;
create trigger sync_property_gender_preference
before insert or update of gender_preference, gender_suitability on public.properties
for each row execute function private.sync_property_gender_preference();

update public.properties
set gender_preference = 'male'::public.gender_preference
where rent_type = 'bed'::public.rent_type
  and gender_preference = 'male'::public.gender_preference
  and gender_suitability = 'mixed'::public.gender_suitability;

commit;
