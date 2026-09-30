CREATE TABLE public.partner_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'b2b' CHECK (kind IN ('b2b','white_label')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 1000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','developer','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE TABLE public.partner_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.partner_api_usage (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.partner_api_keys(id) ON DELETE SET NULL,
  user_id uuid,
  auth_method text NOT NULL CHECK (auth_method IN ('api_key','oauth')),
  operation text NOT NULL,
  status integer NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_api_usage_tenant_time ON public.partner_api_usage (tenant_id, created_at DESC);

GRANT SELECT ON public.partner_tenants, public.partner_members, public.partner_api_keys, public.partner_api_usage TO authenticated;
GRANT ALL ON public.partner_tenants, public.partner_members, public.partner_api_keys, public.partner_api_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partner_api_usage_id_seq TO service_role;

ALTER TABLE public.partner_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_partner_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_members WHERE tenant_id = _tenant AND user_id = _user)
$$;

CREATE POLICY "Members and staff read tenants" ON public.partner_tenants FOR SELECT TO authenticated
  USING (public.is_partner_member(id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "Members and staff read memberships" ON public.partner_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Members and staff read key metadata" ON public.partner_api_keys FOR SELECT TO authenticated
  USING (public.is_partner_member(tenant_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "Members and staff read usage" ON public.partner_api_usage FOR SELECT TO authenticated
  USING (public.is_partner_member(tenant_id, auth.uid()) OR public.is_staff(auth.uid()));

REVOKE SELECT (key_hash) ON public.partner_api_keys FROM authenticated;

CREATE TRIGGER partner_tenants_updated_at BEFORE UPDATE ON public.partner_tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();