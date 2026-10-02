-- Worldway AI observability: safe operational traces only.
create table if not exists public.ai_traces (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  session_id text,
  actor_id uuid references auth.users(id) on delete set null,
  task text,
  provider text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cost_credits numeric(18,8),
  validation text check (validation is null or validation in ('passed','failed','repaired','skipped')),
  fallback boolean not null default false,
  tool_names jsonb not null default '[]'::jsonb,
  tool_risks jsonb not null default '[]'::jsonb,
  outcome text,
  error_category text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  retain_until timestamptz
);

create index if not exists ai_traces_created_at_idx on public.ai_traces(created_at desc);
create index if not exists ai_traces_request_id_idx on public.ai_traces(request_id);
create index if not exists ai_traces_session_id_idx on public.ai_traces(session_id);
create index if not exists ai_traces_actor_id_idx on public.ai_traces(actor_id);
create index if not exists ai_traces_provider_model_idx on public.ai_traces(provider, model);

alter table public.ai_traces enable row level security;

drop policy if exists "Staff read AI traces" on public.ai_traces;
create policy "Staff read AI traces"
  on public.ai_traces
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists "No client insert AI traces" on public.ai_traces;
drop policy if exists "No client update AI traces" on public.ai_traces;
drop policy if exists "No client delete AI traces" on public.ai_traces;

revoke insert, update, delete on public.ai_traces from anon, authenticated;
grant select on public.ai_traces to authenticated;

comment on table public.ai_traces is 'Safe Worldway AI operational telemetry. Never store prompts, secrets, payment data, or unnecessary PII.';
