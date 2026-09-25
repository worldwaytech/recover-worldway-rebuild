CREATE TABLE public.ttc_config (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  tap_id text,
  tap_id_updated_at timestamptz,
  tap_id_updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ttc_config TO service_role;
REVOKE ALL ON public.ttc_config FROM anon, authenticated;
ALTER TABLE public.ttc_config ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER ttc_config_updated_at BEFORE UPDATE ON public.ttc_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();