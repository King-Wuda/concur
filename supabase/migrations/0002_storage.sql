-- ============================================================================
-- Private storage bucket for receipt images and PDFs.
--
-- Objects are stored as `<user_id>/<uuid>.<ext>`, and the policies below use
-- that first path segment as the owner check, so one user can never read or
-- write another user's receipts. Nothing in the bucket is publicly readable;
-- the app hands out short-lived signed URLs instead.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_objects_owner_select on storage.objects;
drop policy if exists receipts_objects_owner_insert on storage.objects;
drop policy if exists receipts_objects_owner_update on storage.objects;
drop policy if exists receipts_objects_owner_delete on storage.objects;

create policy receipts_objects_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy receipts_objects_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy receipts_objects_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy receipts_objects_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
