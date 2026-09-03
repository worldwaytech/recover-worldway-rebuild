CREATE TABLE public.tripjack_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  suite text NOT NULL,
  capability text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  environment text NOT NULL DEFAULT 'uat',
  request_query jsonb,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  duration_ms integer NOT NULL DEFAULT 0,
  outcome text NOT NULL,
  error_kind text,
  test_case text,
  supplier_booking_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tripjack_api_logs TO authenticated;
GRANT ALL ON public.tripjack_api_logs TO service_role;
ALTER TABLE public.tripjack_api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view TripJack API logs" ON public.tripjack_api_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX idx_tripjack_api_logs_created ON public.tripjack_api_logs(created_at DESC);
CREATE INDEX idx_tripjack_api_logs_booking ON public.tripjack_api_logs(supplier_booking_id);
CREATE INDEX idx_tripjack_api_logs_case ON public.tripjack_api_logs(test_case);

CREATE TABLE public.tripjack_certification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key text NOT NULL UNIQUE,
  suite text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  worldway_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  supplier_booking_id text,
  confirmation_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tripjack_certification_cases TO authenticated;
GRANT ALL ON public.tripjack_certification_cases TO service_role;
ALTER TABLE public.tripjack_certification_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view TripJack certification cases" ON public.tripjack_certification_cases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can create TripJack certification cases" ON public.tripjack_certification_cases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update TripJack certification cases" ON public.tripjack_certification_cases FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_tripjack_certification_cases_updated BEFORE UPDATE ON public.tripjack_certification_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();