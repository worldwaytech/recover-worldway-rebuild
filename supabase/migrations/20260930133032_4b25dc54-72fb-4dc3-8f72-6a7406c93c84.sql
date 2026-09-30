CREATE TABLE public.travelshop_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id bigint NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  tour_code text,
  name text NOT NULL,
  summary text,
  description_html text,
  category_slug text,
  category_name text,
  activities text[] NOT NULL DEFAULT '{}',
  destinations text[] NOT NULL DEFAULT '{}',
  destination_slugs text[] NOT NULL DEFAULT '{}',
  country text,
  region text,
  start_location text,
  end_location text,
  duration_days integer,
  duration_hours numeric,
  languages text[] NOT NULL DEFAULT '{}',
  rating numeric,
  review_count integer NOT NULL DEFAULT 0,
  currency text,
  price_from numeric,
  net_price_from numeric,
  is_private boolean NOT NULL DEFAULT false,
  is_regular boolean NOT NULL DEFAULT false,
  free_cancellation boolean NOT NULL DEFAULT false,
  instant_confirmation boolean NOT NULL DEFAULT false,
  group_min integer,
  group_max integer,
  max_pax integer,
  suitable_ages text,
  cover_image text,
  images jsonb NOT NULL DEFAULT '[]',
  itinerary jsonb NOT NULL DEFAULT '[]',
  highlights jsonb NOT NULL DEFAULT '[]',
  inclusions jsonb NOT NULL DEFAULT '[]',
  exclusions jsonb NOT NULL DEFAULT '[]',
  details jsonb NOT NULL DEFAULT '{}',
  source_ref jsonb NOT NULL DEFAULT '{}',
  source_status text,
  source_updated_at timestamptz,
  source_deleted_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  content_hash text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_seen_run uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travelshop_tours_active_idx ON public.travelshop_tours (is_active, rating DESC);
CREATE INDEX travelshop_tours_category_idx ON public.travelshop_tours (category_slug);
CREATE INDEX travelshop_tours_country_idx ON public.travelshop_tours (country);
CREATE INDEX travelshop_tours_dest_idx ON public.travelshop_tours USING gin (destination_slugs);
CREATE INDEX travelshop_tours_act_idx ON public.travelshop_tours USING gin (activities);
GRANT SELECT ON public.travelshop_tours TO authenticated;
GRANT ALL ON public.travelshop_tours TO service_role;
ALTER TABLE public.travelshop_tours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view tour catalogue records" ON public.travelshop_tours FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER travelshop_tours_updated_at BEFORE UPDATE ON public.travelshop_tours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.travelshop_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',
  scope text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'running',
  total_reported integer,
  pages_total integer,
  next_page integer NOT NULL DEFAULT 1,
  pages_done integer NOT NULL DEFAULT 0,
  fetched integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  deactivated integer NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.travelshop_sync_runs TO authenticated;
GRANT ALL ON public.travelshop_sync_runs TO service_role;
ALTER TABLE public.travelshop_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view tour sync runs" ON public.travelshop_sync_runs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER travelshop_sync_runs_updated_at BEFORE UPDATE ON public.travelshop_sync_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.travelshop_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.travelshop_sync_runs(id) ON DELETE CASCADE,
  page integer,
  external_id bigint,
  slug text,
  kind text NOT NULL,
  error text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.travelshop_sync_failures TO authenticated;
GRANT ALL ON public.travelshop_sync_failures TO service_role;
ALTER TABLE public.travelshop_sync_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view tour sync failures" ON public.travelshop_sync_failures FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.travelshop_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_external_id bigint NOT NULL,
  tour_slug text NOT NULL,
  tour_name text NOT NULL,
  tour_date date NOT NULL,
  service_type text NOT NULL,
  adults integer NOT NULL,
  children integer NOT NULL DEFAULT 0,
  infants integer NOT NULL DEFAULT 0,
  rooms jsonb NOT NULL DEFAULT '{}',
  lead_traveller jsonb NOT NULL,
  special_requests text,
  supplier_currency text NOT NULL,
  supplier_retail_total numeric NOT NULL,
  supplier_net_total numeric,
  markup_percent numeric,
  pricing_basis text NOT NULL,
  customer_currency text NOT NULL,
  customer_total numeric NOT NULL,
  price_checked_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_supplier_authorization',
  supplier_reference_id text,
  supplier_booking_token text,
  supplier_status text,
  supplier_payment_request jsonb,
  supplier_response jsonb,
  events jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travelshop_bookings_user_idx ON public.travelshop_bookings (user_id, created_at DESC);
GRANT SELECT ON public.travelshop_bookings TO authenticated;
GRANT ALL ON public.travelshop_bookings TO service_role;
ALTER TABLE public.travelshop_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view tour bookings" ON public.travelshop_bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER travelshop_bookings_updated_at BEFORE UPDATE ON public.travelshop_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();