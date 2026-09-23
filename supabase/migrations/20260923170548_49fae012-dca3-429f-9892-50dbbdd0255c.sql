CREATE TABLE public.hbx_transfer_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  code text NOT NULL,
  point_type text NOT NULL CHECK (point_type IN ('ATLAS','IATA','PORT','STATION','GIATA')),
  name text NOT NULL,
  country_code text,
  destination_code text,
  city text,
  latitude numeric,
  longitude numeric,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, point_type, code)
);
GRANT SELECT ON public.hbx_transfer_points TO anon, authenticated;
GRANT ALL ON public.hbx_transfer_points TO service_role;
ALTER TABLE public.hbx_transfer_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transfer points are public content" ON public.hbx_transfer_points FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX hbx_transfer_points_name_idx ON public.hbx_transfer_points (environment, lower(name));
CREATE INDEX hbx_transfer_points_dest_idx ON public.hbx_transfer_points (environment, destination_code);
CREATE TRIGGER hbx_transfer_points_updated_at BEFORE UPDATE ON public.hbx_transfer_points FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX bookings_idempotency_key_uidx ON public.bookings (idempotency_key) WHERE idempotency_key IS NOT NULL;