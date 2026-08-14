-- Quote deletion removes its private audio and PDF objects before the
-- database row is deleted, so authenticated contractors need delete access
-- to objects under their own storage folder.
create policy quote_audio_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quote-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy quote_pdfs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
