ALTER TABLE public.bokun_products
  ADD COLUMN IF NOT EXISTS supplier_id text,
  ADD COLUMN IF NOT EXISTS vendor_title text,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cancellation_policy jsonb,
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS supplier_updated_at text;

REVOKE SELECT ON public.bokun_products FROM anon, authenticated;
GRANT SELECT (id, product_id, title, summary, city, country, duration_text, price_from, currency, cover_photo, active, synced_at) ON public.bokun_products TO anon, authenticated;
DROP POLICY IF EXISTS "Public can view tour catalogue" ON public.bokun_products;
CREATE POLICY "Public can view active tour catalogue" ON public.bokun_products FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Staff can view all tour catalogue" ON public.bokun_products FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.bokun_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id text NOT NULL UNIQUE,
  title text,
  source text NOT NULL DEFAULT 'active-ids',
  product_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'authorized',
  last_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bokun_suppliers TO authenticated;
GRANT ALL ON public.bokun_suppliers TO service_role;
ALTER TABLE public.bokun_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read suppliers" ON public.bokun_suppliers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER bokun_suppliers_updated_at BEFORE UPDATE ON public.bokun_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bokun_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  trigger text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  environment text NOT NULL,
  suppliers integer NOT NULL DEFAULT 0,
  product_lists integer NOT NULL DEFAULT 0,
  discovered integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  deactivated_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bokun_sync_runs TO authenticated;
GRANT ALL ON public.bokun_sync_runs TO service_role;
ALTER TABLE public.bokun_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sync runs" ON public.bokun_sync_runs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER bokun_sync_runs_updated_at BEFORE UPDATE ON public.bokun_sync_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();