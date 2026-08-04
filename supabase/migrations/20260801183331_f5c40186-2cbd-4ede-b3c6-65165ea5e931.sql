CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_kind text NOT NULL,
  product_slug text NOT NULL,
  product_title text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  travel_month text,
  party_size integer,
  budget text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.quote_requests TO anon;
GRANT SELECT, INSERT ON public.quote_requests TO authenticated;
GRANT ALL ON public.quote_requests TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone may request a quote" ON public.quote_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Members read their own quote requests" ON public.quote_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.catalogue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  kind text,
  slug text,
  query text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.catalogue_events TO anon;
GRANT INSERT ON public.catalogue_events TO authenticated;
GRANT ALL ON public.catalogue_events TO service_role;
ALTER TABLE public.catalogue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone may record catalogue analytics" ON public.catalogue_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS catalogue_events_type_idx ON public.catalogue_events (event_type, created_at DESC);