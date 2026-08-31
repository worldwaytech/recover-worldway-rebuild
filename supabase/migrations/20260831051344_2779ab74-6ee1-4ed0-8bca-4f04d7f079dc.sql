CREATE TABLE public.ttc_tours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  brand_label text,
  tour_slug text NOT NULL,
  source_url text NOT NULL,
  locale text NOT NULL DEFAULT 'en-us',
  supplier_tour_id text,
  supplier_option_id text,
  name text NOT NULL,
  subtitle text,
  summary text,
  description text,
  hero_image text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_days integer,
  duration_nights integer,
  countries jsonb NOT NULL DEFAULT '[]'::jsonb,
  destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_city text,
  end_city text,
  group_size text,
  group_size_max integer,
  price_from numeric,
  price_currency text,
  price_note text,
  tour_style text,
  trip_type text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  itinerary jsonb NOT NULL DEFAULT '[]'::jsonb,
  accommodation jsonb NOT NULL DEFAULT '[]'::jsonb,
  transport jsonb NOT NULL DEFAULT '[]'::jsonb,
  meals jsonb NOT NULL DEFAULT '[]'::jsonb,
  tour_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  departures jsonb NOT NULL DEFAULT '[]'::jsonb,
  seasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_rating numeric,
  review_count integer,
  source text NOT NULL DEFAULT 'website',
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  source_scraped_at timestamptz,
  api_synced_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, tour_slug)
);
CREATE INDEX ttc_tours_brand_idx ON public.ttc_tours (brand);
CREATE INDEX ttc_tours_name_idx ON public.ttc_tours (lower(name));
CREATE INDEX ttc_tours_duration_idx ON public.ttc_tours (duration_days);
CREATE INDEX ttc_tours_price_idx ON public.ttc_tours (price_from);
GRANT SELECT ON public.ttc_tours TO anon, authenticated;
GRANT ALL ON public.ttc_tours TO service_role;
ALTER TABLE public.ttc_tours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TTC tours are public catalogue content" ON public.ttc_tours FOR SELECT TO anon, authenticated USING (true);

CREATE TRIGGER ttc_tours_set_updated_at
  BEFORE UPDATE ON public.ttc_tours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ttc_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL DEFAULT 'all',
  source text NOT NULL DEFAULT 'website',
  resource text NOT NULL DEFAULT 'tours',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  discovered integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  cursor text,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ttc_sync_runs_recent_idx ON public.ttc_sync_runs (brand, started_at DESC);
GRANT ALL ON public.ttc_sync_runs TO service_role;
ALTER TABLE public.ttc_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ttc_sync_runs_set_updated_at
  BEFORE UPDATE ON public.ttc_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();