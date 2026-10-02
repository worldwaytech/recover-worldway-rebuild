CREATE TABLE public.ai_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  session_id text,
  actor_id uuid,
  event_type text NOT NULL,
  task text,
  provider text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cost_credits numeric(12,6),
  validation text CHECK (validation IS NULL OR validation IN ('passed','failed','repaired','skipped')),
  fallback boolean NOT NULL DEFAULT false,
  tool_name text,
  tool_risk text,
  outcome text,
  error_category text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);
GRANT SELECT ON public.ai_traces TO authenticated;
GRANT ALL ON public.ai_traces TO service_role;
ALTER TABLE public.ai_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view AI traces" ON public.ai_traces FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX ai_traces_request_idx ON public.ai_traces (request_id);
CREATE INDEX ai_traces_created_idx ON public.ai_traces (created_at DESC);
CREATE INDEX ai_traces_expires_idx ON public.ai_traces (expires_at);
CREATE INDEX ai_traces_task_outcome_idx ON public.ai_traces (task, outcome, created_at DESC);
COMMENT ON TABLE public.ai_traces IS 'Safe AI operational metadata only (no prompts, secrets, payment data or PII). Written by service role; staff read.';