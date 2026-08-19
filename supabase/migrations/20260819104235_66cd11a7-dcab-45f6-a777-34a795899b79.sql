CREATE TABLE public.hbx_destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL DEFAULT 'test',
  code text NOT NULL,
  name text NOT NULL,
  country_code text,
  type text,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, code)
);
GRANT SELECT ON public.hbx_destinations TO anon, authenticated;
GRANT ALL ON public.hbx_destinations TO service_role;
ALTER TABLE public.hbx_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HBX destinations are public content" ON public.hbx_destinations FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hbx_hotels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL DEFAULT 'test',
  code text NOT NULL,
  name text NOT NULL,
  category_code text,
  category_name text,
  star_rating numeric,
  destination_code text,
  destination_name text,
  zone_code text,
  zone_name text,
  country_code text,
  state_code text,
  city text,
  address text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  description text,
  facilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  board_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  segment_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking integer,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, code)
);
CREATE INDEX hbx_hotels_destination_idx ON public.hbx_hotels (environment, destination_code);
CREATE INDEX hbx_hotels_country_idx ON public.hbx_hotels (environment, country_code);
CREATE INDEX hbx_hotels_name_idx ON public.hbx_hotels (lower(name));
GRANT SELECT ON public.hbx_hotels TO anon, authenticated;
GRANT ALL ON public.hbx_hotels TO service_role;
ALTER TABLE public.hbx_hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HBX hotels are public content" ON public.hbx_hotels FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hbx_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL DEFAULT 'test',
  code text NOT NULL,
  name text NOT NULL,
  country_code text,
  destination_code text,
  destination_name text,
  city text,
  type text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text,
  amount_from numeric,
  duration text,
  latitude numeric,
  longitude numeric,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, code)
);
CREATE INDEX hbx_activities_destination_idx ON public.hbx_activities (environment, destination_code);
CREATE INDEX hbx_activities_name_idx ON public.hbx_activities (lower(name));
GRANT SELECT ON public.hbx_activities TO anon, authenticated;
GRANT ALL ON public.hbx_activities TO service_role;
ALTER TABLE public.hbx_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HBX activities are public content" ON public.hbx_activities FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hbx_transfer_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment text NOT NULL DEFAULT 'test',
  code text NOT NULL,
  from_type text,
  from_code text,
  from_name text,
  to_type text,
  to_code text,
  to_name text,
  country_code text,
  destination_code text,
  destination_name text,
  vehicle_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, code)
);
CREATE INDEX hbx_transfer_routes_destination_idx ON public.hbx_transfer_routes (environment, destination_code);
GRANT SELECT ON public.hbx_transfer_routes TO anon, authenticated;
GRANT ALL ON public.hbx_transfer_routes TO service_role;
ALTER TABLE public.hbx_transfer_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HBX transfer routes are public content" ON public.hbx_transfer_routes FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hbx_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite text NOT NULL,
  resource text NOT NULL DEFAULT 'content',
  environment text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  received integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  cursor text,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hbx_sync_runs_recent_idx ON public.hbx_sync_runs (suite, started_at DESC);
GRANT SELECT ON public.hbx_sync_runs TO authenticated;
GRANT ALL ON public.hbx_sync_runs TO service_role;
ALTER TABLE public.hbx_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view HBX sync history" ON public.hbx_sync_runs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER hbx_destinations_updated_at BEFORE UPDATE ON public.hbx_destinations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hbx_hotels_updated_at BEFORE UPDATE ON public.hbx_hotels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hbx_activities_updated_at BEFORE UPDATE ON public.hbx_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hbx_transfer_routes_updated_at BEFORE UPDATE ON public.hbx_transfer_routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hbx_sync_runs_updated_at BEFORE UPDATE ON public.hbx_sync_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();