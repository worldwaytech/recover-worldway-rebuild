DROP POLICY IF EXISTS "Staff can read database exports" ON storage.objects;
DROP POLICY IF EXISTS "Staff can write database exports" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update database exports" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete database exports" ON storage.objects;

CREATE POLICY "Staff can read database exports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'database_export_02_08_26' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can write database exports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'database_export_02_08_26' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update database exports"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'database_export_02_08_26' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'database_export_02_08_26' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete database exports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'database_export_02_08_26' AND public.is_staff(auth.uid()));