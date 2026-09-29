-- Explicit Super Admin-only policy on ttc_config (server writes use the service role).
CREATE POLICY "Super admins manage ttc config" ON public.ttc_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Persistent supplier health: one current row per supplier + append-only call history.
CREATE TABLE public.supplier_health_status (
  supplier_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'unknown',
  readiness text NOT NULL DEFAULT 'disabled',
  booking_eligible boolean NOT NULL DEFAULT false,
  calls integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  error_rate numeric NOT NULL DEFAULT 0,
  p50_ms integer,
  reliability numeric NOT NULL DEFAULT 0,
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_health_status TO authenticated;
GRANT ALL ON public.supplier_health_status TO service_role;
ALTER TABLE public.supplier_health_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read supplier health" ON public.supplier_health_status
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.supplier_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  capability text NOT NULL,
  outcome text NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  result_count integer NOT NULL DEFAULT 0,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_health_events_key_time ON public.supplier_health_events (supplier_key, created_at DESC);
GRANT SELECT ON public.supplier_health_events TO authenticated;
GRANT ALL ON public.supplier_health_events TO service_role;
ALTER TABLE public.supplier_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read supplier health events" ON public.supplier_health_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));