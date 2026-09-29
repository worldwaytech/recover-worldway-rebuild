DROP POLICY IF EXISTS "Public can read journey catalogue" ON public.aktg_journeys;
REVOKE SELECT ON public.aktg_journeys FROM anon;