CREATE TABLE public.private_aviation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('charter','empty_leg')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated','submitted','sourcing','options_sent','booked','closed','failed')),
  origin text NOT NULL,
  destination text NOT NULL,
  departure_date date,
  return_date date,
  round_trip boolean NOT NULL DEFAULT false,
  passengers integer NOT NULL DEFAULT 1,
  aircraft_category text,
  estimate jsonb,
  empty_leg jsonb,
  customer_name text,
  customer_email text,
  customer_phone text,
  special_requests text,
  preferences jsonb,
  supplier_session text,
  supplier_trip_id text,
  supplier_status text,
  supplier_tracking_link text,
  supplier_response jsonb,
  last_error text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.private_aviation_requests TO service_role;
GRANT SELECT ON public.private_aviation_requests TO authenticated;
ALTER TABLE public.private_aviation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins view private aviation requests" ON public.private_aviation_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX private_aviation_requests_user_idx ON public.private_aviation_requests(user_id, created_at DESC);
CREATE TRIGGER trg_private_aviation_requests_updated_at BEFORE UPDATE ON public.private_aviation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();