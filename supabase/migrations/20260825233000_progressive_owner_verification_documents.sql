begin;

-- New private bucket dedicated to progressive property-ownership evidence.
-- It is intentionally distinct from the legacy verification-documents bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification_documents',
  'verification_documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.property_media
  drop constraint if exists property_media_storage_bucket_check;

alter table public.property_media
  add constraint property_media_storage_bucket_check
  check (storage_bucket in ('property-images', 'property-media-staging', 'verification-documents', 'verification_documents'));

create or replace function private.enforce_private_verification_document_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  property_owner_id uuid;
begin
  if new.media_type = 'verification_document'::public.media_type then
    if new.storage_bucket not in ('verification-documents', 'verification_documents')
       or new.is_public
       or new.public_storage_bucket is not null
       or new.public_storage_path is not null then
      raise exception 'Verification documents must remain private';
    end if;

    select owner_id into property_owner_id
    from public.properties
    where id = new.property_id;

    if property_owner_id is null
       or split_part(new.storage_path, '/', 1) <> property_owner_id::text then
      raise exception 'Verification document path must belong to the property owner';
    end if;
  elsif new.storage_bucket = 'verification_documents' then
    raise exception 'The verification_documents bucket accepts verification documents only';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_private_verification_document_media() from public, anon, authenticated;

drop trigger if exists property_media_enforce_private_verification_document on public.property_media;
create trigger property_media_enforce_private_verification_document
before insert or update on public.property_media
for each row execute procedure private.enforce_private_verification_document_media();

drop policy if exists "owners upload ownership documents under own path" on storage.objects;
create policy "owners upload ownership documents under own path"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification_documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.current_user_role() = 'owner'::public.app_role
);

drop policy if exists "owners or staff read ownership documents" on storage.objects;
create policy "owners or staff read ownership documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification_documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or private.is_staff())
);

commit;
