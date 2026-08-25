-- Storage buckets for uploaded audio recordings and generated quote PDFs.
-- Migration version aligned with the hosted production history.
-- Both are private: every read goes through a signed URL or the
-- authenticated user's own RLS-scoped access, never a public URL.
insert into storage.buckets (id, name, public)
values ('quote-audio', 'quote-audio', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('quote-pdfs', 'quote-pdfs', false)
on conflict (id) do nothing;

-- RLS is enabled on storage.objects by default with zero permissive
-- policies, so without these every upload/download in the app (which all
-- run through the user's anon-key client, not the service role) fails with
-- a permission-denied error. All three call sites write objects at
-- `${contractor_id}/...`, so scope access to the leading path segment
-- matching the caller's own auth uid.

create policy quote_audio_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_audio_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_pdfs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_pdfs_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The PDF upload uses upsert: true (finalize can be retried, and the
-- download route regenerates on demand), which requires update permission
-- for the case where the object already exists.
create policy quote_pdfs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'quote-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
