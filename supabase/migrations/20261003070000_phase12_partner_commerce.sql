-- Phase 12: Global Partner, B2B & White-Label Commerce.
-- Configuration only: financial mutations continue through the existing
-- service-role wallet and booking functions. No duplicate money ledger.

CREATE TABLE public.partner_storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  host text,
  brand_name text NOT NULL,
  tagline text,
  logo_url text,
  hero_image_url text,
  primary_color text,
  accent_color text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id),
  UNIQUE (slug),
  UNIQUE (host)
);

CREATE TABLE public.partner_catalog_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  product text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('allow','deny')),
  category text,
  external_ids text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.partner_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  product text NOT NULL,
  percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  fixed_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  currency text,
  maximum numeric(18,2) CHECK (maximum IS NULL OR maximum >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX partner_catalog_rules_tenant_idx ON public.partner_catalog_rules (tenant_id, product);
CREATE INDEX partner_commission_rules_tenant_idx ON public.partner_commission_rules (tenant_id, product);

GRANT SELECT ON public.partner_storefronts, public.partner_catalog_rules, public.partner_commission_rules TO authenticated;
GRANT ALL ON public.partner_storefronts, public.partner_catalog_rules, public.partner_commission_rules TO service_role;

ALTER TABLE public.partner_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_catalog_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner members read storefront" ON public.partner_storefronts FOR SELECT TO authenticated
  USING (public.is_partner_member(tenant_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "Partner members read catalogue rules" ON public.partner_catalog_rules FOR SELECT TO authenticated
  USING (public.is_partner_member(tenant_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "Partner members read commission rules" ON public.partner_commission_rules FOR SELECT TO authenticated
  USING (public.is_partner_member(tenant_id, auth.uid()) OR public.is_staff(auth.uid()));

CREATE TRIGGER partner_storefronts_updated_at BEFORE UPDATE ON public.partner_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Partner storefront lookup is intentionally read-only to authenticated users;
-- host resolution for public rendering is server-side and never trusts client tenant IDs.
