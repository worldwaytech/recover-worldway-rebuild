ALTER TABLE public.ttc_tours
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS worldway_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ttc_sync_runs ADD COLUMN IF NOT EXISTS deactivated integer NOT NULL DEFAULT 0;

CREATE TABLE public.aktg_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  code text,
  title text NOT NULL,
  journey_type text,
  card jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  is_active boolean NOT NULL DEFAULT true,
  source_url text,
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  deactivated_at timestamptz,
  worldway_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aktg_journeys TO anon, authenticated;
GRANT ALL ON public.aktg_journeys TO service_role;
ALTER TABLE public.aktg_journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read journey catalogue" ON public.aktg_journeys FOR SELECT TO anon, authenticated USING (true);
CREATE TRIGGER aktg_journeys_updated_at BEFORE UPDATE ON public.aktg_journeys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.catalogue_sync_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('aktg','ttc')),
  status text NOT NULL DEFAULT 'running',
  discovered integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  deactivated integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogue_sync_sessions TO authenticated;
GRANT ALL ON public.catalogue_sync_sessions TO service_role;
ALTER TABLE public.catalogue_sync_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read sync sessions" ON public.catalogue_sync_sessions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER catalogue_sync_sessions_updated_at BEFORE UPDATE ON public.catalogue_sync_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();