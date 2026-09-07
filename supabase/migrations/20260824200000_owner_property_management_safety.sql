begin;

create or replace function private.owner_property_deletion_summary(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype; booking_total integer; financial_total integer; review_total integer;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then
    raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501';
  end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  select count(*) into booking_total from public.bookings where property_id = property_row.id;
  select count(*) into financial_total from public.booking_financials f join public.bookings b on b.id = f.booking_id where b.property_id = property_row.id;
  select count(*) into review_total from public.property_review_events where property_id = property_row.id;
  return jsonb_build_object(
    'propertyId', property_row.id,
    'canDelete', booking_total = 0 and financial_total = 0 and review_total = 0,
    'bookingCount', booking_total,
    'financialRecordCount', financial_total,
    'reviewEventCount', review_total,
    'message', case when booking_total > 0 or financial_total > 0 then 'لا يمكن حذف العقار لأنه مرتبط بطلبات معاينة أو سجلات مالية يجب الاحتفاظ بها. أخفه أو حدّد عدم توفره بدلاً من الحذف.' when review_total > 0 then 'لا يمكن حذف العقار لأن له سجل مراجعة تشغيلي يجب الاحتفاظ به. أخفه أو حدّد عدم توفره بدلاً من الحذف.' else 'يمكن حذف العقار بأمان.' end
  );
end;
$$;

create or replace function public.owner_property_deletion_eligibility(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.owner_property_deletion_summary(target_property_id);
end;
$$;

create or replace function public.owner_delete_property_safely(target_property_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare summary jsonb; property_row public.properties%rowtype; media_objects jsonb;
begin
  summary := private.owner_property_deletion_summary(target_property_id);
  if not coalesce((summary ->> 'canDelete')::boolean, false) then raise exception '%', summary ->> 'message' using errcode = 'P0002'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  select coalesce(jsonb_agg(jsonb_build_object('storageBucket', m.storage_bucket, 'storagePath', m.storage_path, 'publicStorageBucket', m.public_storage_bucket, 'publicStoragePath', m.public_storage_path)), '[]'::jsonb)
    into media_objects from public.property_media m where m.property_id = property_row.id;
  delete from public.properties where id = property_row.id and owner_id = auth.uid();
  if not found then raise exception 'تعذر حذف العقار بأمان. حاول مرة أخرى.' using errcode = 'P0002'; end if;
  return jsonb_build_object('propertyId', property_row.id, 'deleted', true, 'mediaObjects', media_objects);
end;
$$;

create or replace function public.owner_set_property_availability(target_property_id uuid, target_availability public.availability_status)
returns public.properties language plpgsql security definer set search_path = '' as $$
declare property_row public.properties%rowtype;
begin
  if auth.uid() is null or private.current_user_role() is distinct from 'owner'::public.app_role then raise exception 'هذه العملية مخصصة لمالك العقار المعتمد.' using errcode = '42501'; end if;
  select * into property_row from public.properties where id = target_property_id and owner_id = auth.uid() for update;
  if not found then raise exception 'العقار غير موجود أو لا تملك صلاحية إدارته.' using errcode = '42501'; end if;
  if target_availability = 'available'::public.availability_status and property_row.verification_status <> 'verified'::public.verification_status then raise exception 'لا يمكن إظهار العقار للطلاب قبل اعتماده من الإدارة.' using errcode = '42501'; end if;
  update public.properties set availability_status = target_availability where id = property_row.id returning * into property_row;
  return property_row;
end;
$$;

revoke all on function private.owner_property_deletion_summary(uuid) from public, anon, authenticated;
revoke all on function public.owner_property_deletion_eligibility(uuid), public.owner_delete_property_safely(uuid), public.owner_set_property_availability(uuid, public.availability_status) from public, anon;
grant execute on function public.owner_property_deletion_eligibility(uuid), public.owner_delete_property_safely(uuid), public.owner_set_property_availability(uuid, public.availability_status) to authenticated;

commit;
