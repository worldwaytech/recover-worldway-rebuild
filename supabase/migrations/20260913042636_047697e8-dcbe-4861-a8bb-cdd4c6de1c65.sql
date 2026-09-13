CREATE TABLE public.integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  summary text NOT NULL DEFAULT '',
  base_url text NOT NULL DEFAULT '',
  auth_kind text NOT NULL DEFAULT 'api-key-header',
  auth_header text,
  token_path text,
  scope text,
  secret_names text[] NOT NULL DEFAULT '{}',
  endpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities text[] NOT NULL DEFAULT '{}',
  collections text[] NOT NULL DEFAULT '{}',
  rate_limit_per_second integer NOT NULL DEFAULT 5,
  cache_ttl_seconds integer NOT NULL DEFAULT 900,
  max_retries integer NOT NULL DEFAULT 3,
  timeout_ms integer NOT NULL DEFAULT 12000,
  sync_strategy text NOT NULL DEFAULT 'full',
  pagination jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_keys text[] NOT NULL DEFAULT '{external_id}',
  conflict_policy text NOT NULL DEFAULT 'supplier-wins',
  record_path text,
  enabled boolean NOT NULL DEFAULT true,
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  auto_sync_interval_minutes integer NOT NULL DEFAULT 360,
  webhook_secret_name text,
  docs_url text,
  contract_status text NOT NULL DEFAULT 'prospective',
  adapter text,
  origin text NOT NULL DEFAULT 'registry',
  connection_state text NOT NULL DEFAULT 'unknown',
  connection_checked_at timestamptz,
  connection_detail text,
  last_sync_at timestamptz,
  last_sync_status text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.integration_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  global_enabled boolean NOT NULL DEFAULT true,
  global_auto_sync boolean NOT NULL DEFAULT false,
  maintenance_paused boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.integration_settings (id) VALUES (true);

CREATE TABLE public.integration_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  scope text NOT NULL DEFAULT 'full',
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  external_id text,
  discovered integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  cursor text,
  attempts integer NOT NULL DEFAULT 1,
  error text,
  idempotency_key text UNIQUE,
  initiated_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer
);
CREATE INDEX integration_sync_runs_provider_idx ON public.integration_sync_runs (provider_key, started_at DESC);

CREATE TABLE public.integration_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  external_id text NOT NULL,
  product_type text NOT NULL DEFAULT 'product',
  slug text,
  title text NOT NULL DEFAULT '',
  source_table text,
  detail_path text,
  sync_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  fingerprint text,
  price_from numeric,
  currency text,
  availability_state text,
  conflict_state text NOT NULL DEFAULT 'none',
  supplier_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_id)
);
CREATE INDEX integration_products_provider_idx ON public.integration_products (provider_key, updated_at DESC);
CREATE INDEX integration_products_slug_idx ON public.integration_products (slug);

CREATE TABLE public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  run_id uuid,
  level text NOT NULL DEFAULT 'info',
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  http_status integer,
  latency_ms integer,
  attempts integer,
  message text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_logs_provider_idx ON public.integration_logs (provider_key, created_at DESC);

CREATE TABLE public.integration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  actor_email text,
  action text NOT NULL,
  provider_key text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_audit_created_idx ON public.integration_audit (created_at DESC);

CREATE TABLE public.integration_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  event_type text,
  signature_valid boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_webhook_events_provider_idx ON public.integration_webhook_events (provider_key, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_settings TO authenticated;
GRANT SELECT ON public.integration_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_products TO authenticated;
GRANT SELECT ON public.integration_logs TO authenticated;
GRANT SELECT ON public.integration_audit TO authenticated;
GRANT SELECT ON public.integration_webhook_events TO authenticated;
GRANT ALL ON public.integration_providers TO service_role;
GRANT ALL ON public.integration_settings TO service_role;
GRANT ALL ON public.integration_sync_runs TO service_role;
GRANT ALL ON public.integration_products TO service_role;
GRANT ALL ON public.integration_logs TO service_role;
GRANT ALL ON public.integration_audit TO service_role;
GRANT ALL ON public.integration_webhook_events TO service_role;

ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage integration providers" ON public.integration_providers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff manage integration settings" ON public.integration_settings
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff read integration runs" ON public.integration_sync_runs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff manage integration products" ON public.integration_products
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff read integration logs" ON public.integration_logs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read integration audit" ON public.integration_audit
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read integration webhooks" ON public.integration_webhook_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER integration_providers_updated_at BEFORE UPDATE ON public.integration_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER integration_products_updated_at BEFORE UPDATE ON public.integration_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();