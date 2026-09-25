CREATE TABLE public.viator_diagnostic_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('server','client')),
  environment text,
  step text NOT NULL,
  method text,
  path text,
  http_status integer,
  duration_ms integer,
  ok boolean,
  cart_ref text,
  partner_cart_ref text,
  tracking_id text,
  correlation jsonb NOT NULL DEFAULT '{}'::jsonb,
  request jsonb,
  response jsonb,
  error text
);
CREATE INDEX viator_diagnostic_traces_created_idx ON public.viator_diagnostic_traces (created_at DESC);
CREATE INDEX viator_diagnostic_traces_cart_idx ON public.viator_diagnostic_traces (cart_ref);
GRANT SELECT ON public.viator_diagnostic_traces TO authenticated;
GRANT ALL ON public.viator_diagnostic_traces TO service_role;
ALTER TABLE public.viator_diagnostic_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read viator traces" ON public.viator_diagnostic_traces
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));