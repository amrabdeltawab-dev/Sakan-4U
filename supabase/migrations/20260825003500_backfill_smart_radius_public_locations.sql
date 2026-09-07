begin;

create or replace function private.apply_smart_radius_location_obfuscation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  offset_meters numeric;
  bearing_radians numeric;
  latitude_delta numeric;
  longitude_delta numeric;
begin
  if new.exact_lat is null and new.exact_lng is null then return new; end if;
  if tg_op = 'INSERT'
     or old.exact_lat is distinct from new.exact_lat
     or old.exact_lng is distinct from new.exact_lng
     or new.public_lat is null
     or new.public_lng is null then
    offset_meters := 200 + random() * 100;
    bearing_radians := random() * 2 * pi();
    latitude_delta := (offset_meters * cos(bearing_radians)) / 111320;
    longitude_delta := (offset_meters * sin(bearing_radians)) / (111320 * greatest(abs(cos(radians(new.exact_lat))), 0.01));
    new.public_lat := round((new.exact_lat + latitude_delta)::numeric, 7);
    new.public_lng := round((new.exact_lng + longitude_delta)::numeric, 7);
  end if;
  return new;
end;
$$;

update public.properties
set exact_lat = exact_lat
where exact_lat is not null and (public_lat is null or public_lng is null);

revoke all on function private.apply_smart_radius_location_obfuscation() from public, anon, authenticated;

commit;
