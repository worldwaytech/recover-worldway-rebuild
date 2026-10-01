CREATE TABLE public.intel_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  journey_id uuid,
  proposal_id text NOT NULL,
  label text,
  score numeric,
  total numeric,
  currency text,
  min_confidence numeric,
  bookable boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '[]',
  risks jsonb NOT NULL DEFAULT '[]',
  channels jsonb NOT NULL DEFAULT '[]',
  constraints jsonb NOT NULL DEFAULT '{}',
  margin jsonb,
  recheck_due jsonb NOT NULL DEFAULT '[]',
  last_rechecked_at timestamptz,
  recheck_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intel_decisions_created_idx ON public.intel_decisions (created_at DESC);
CREATE INDEX intel_decisions_journey_idx ON public.intel_decisions (journey_id);
GRANT SELECT ON public.intel_decisions TO authenticated;
GRANT ALL ON public.intel_decisions TO service_role;
ALTER TABLE public.intel_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff or owner read decisions" ON public.intel_decisions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR user_id = auth.uid());

CREATE TABLE public.intel_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  kind text NOT NULL,
  event text NOT NULL CHECK (event IN ('searched','booked','failed','cancelled')),
  ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event, ref)
);
CREATE INDEX intel_outcomes_supplier_idx ON public.intel_outcomes (supplier_key, created_at DESC);
GRANT SELECT ON public.intel_outcomes TO authenticated;
GRANT ALL ON public.intel_outcomes TO service_role;
ALTER TABLE public.intel_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read outcomes" ON public.intel_outcomes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.contracted_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  kind text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  place text NOT NULL,
  timezone text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  net_amount numeric NOT NULL CHECK (net_amount >= 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  refundable boolean NOT NULL DEFAULT false,
  quality numeric,
  active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  verification_note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, supplier_key, external_id),
  CHECK (valid_to >= valid_from)
);
GRANT SELECT ON public.contracted_inventory TO authenticated;
GRANT ALL ON public.contracted_inventory TO service_role;
ALTER TABLE public.contracted_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read contracted inventory" ON public.contracted_inventory FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER contracted_inventory_updated BEFORE UPDATE ON public.contracted_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.intel_recheck_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  checked integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  note text
);
GRANT SELECT ON public.intel_recheck_runs TO authenticated;
GRANT ALL ON public.intel_recheck_runs TO service_role;
ALTER TABLE public.intel_recheck_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read recheck runs" ON public.intel_recheck_runs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));