CREATE TABLE public.journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'USD',
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.journeys TO authenticated;
GRANT ALL ON public.journeys TO service_role;
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or staff read journeys" ON public.journeys FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE TRIGGER journeys_updated_at BEFORE UPDATE ON public.journeys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journey_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  version integer NOT NULL,
  parent_version integer,
  offers jsonb NOT NULL,
  graph jsonb NOT NULL,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  bookable boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  simulation_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, version)
);

CREATE TABLE public.journey_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  base_version integer NOT NULL,
  change jsonb NOT NULL,
  impacted jsonb NOT NULL DEFAULT '[]'::jsonb,
  material jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_delta numeric,
  new_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_pricing jsonb,
  after_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_offers jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  bookable_after boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER journey_simulations_updated_at BEFORE UPDATE ON public.journey_simulations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journey_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  simulation_id uuid NOT NULL REFERENCES public.journey_simulations(id) ON DELETE CASCADE,
  decision text NOT NULL,
  decided_by uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  version integer,
  actor uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journey_events_journey ON public.journey_events (journey_id, created_at);
CREATE INDEX journey_sims_journey ON public.journey_simulations (journey_id, created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['journey_versions','journey_simulations','journey_approvals','journey_events'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner or staff read %s" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.journeys j WHERE j.id = journey_id AND (j.user_id = auth.uid() OR public.is_staff(auth.uid()))))', t, t);
  END LOOP;
END $$;

-- Audit records are append-only for everyone, including server code.
CREATE OR REPLACE FUNCTION public.prevent_journey_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Journey audit records are append-only';
END; $$;
CREATE TRIGGER journey_versions_append_only BEFORE UPDATE OR DELETE ON public.journey_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_journey_audit_mutation();
CREATE TRIGGER journey_approvals_append_only BEFORE UPDATE OR DELETE ON public.journey_approvals FOR EACH ROW EXECUTE FUNCTION public.prevent_journey_audit_mutation();
CREATE TRIGGER journey_events_append_only BEFORE UPDATE OR DELETE ON public.journey_events FOR EACH ROW EXECUTE FUNCTION public.prevent_journey_audit_mutation();