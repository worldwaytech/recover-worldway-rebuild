-- Enforce database-level access rules on stored files.
-- Private export bucket: administrators may read; no API writes are permitted.
DROP POLICY IF EXISTS "Admins can read private export files" ON storage.objects;
CREATE POLICY "Admins can read private export files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'database_export_04_08_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Owner-scoped rules for any other bucket.
DROP POLICY IF EXISTS "Users can read their own files" ON storage.objects;
CREATE POLICY "Users can read their own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id <> 'database_export_04_08_26' AND owner = auth.uid());

DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
CREATE POLICY "Users can upload their own files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id <> 'database_export_04_08_26'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
CREATE POLICY "Users can update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id <> 'database_export_04_08_26' AND owner = auth.uid())
WITH CHECK (bucket_id <> 'database_export_04_08_26' AND owner = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id <> 'database_export_04_08_26' AND owner = auth.uid());