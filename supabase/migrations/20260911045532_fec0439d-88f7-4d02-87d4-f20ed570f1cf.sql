DROP POLICY IF EXISTS "Anyone may record catalogue analytics" ON public.catalogue_events;

CREATE POLICY "Anyone may record catalogue analytics"
ON public.catalogue_events
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());