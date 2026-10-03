-- Phase 14 security/trust evidence. This is metadata only: never store secrets,
-- payment credentials, raw prompts, or customer content in this table.

create table if not exists public.worldway_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'auth_denied','tenant_denied','rate_limited','injection_blocked',
    'tool_denied','policy_denied','incident','control_check'
  )),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  correlation_id text,
  principal_hash text,
  tenant_hash text,
  control_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.worldway_security_events enable row level security;
revoke all on public.worldway_security_events from public, anon, authenticated;

create policy "staff can read security events"
  on public.worldway_security_events for select to authenticated
  using (public.worldway_is_staff());

create index if not exists worldway_security_events_created_idx
  on public.worldway_security_events(created_at desc);
create index if not exists worldway_security_events_type_idx
  on public.worldway_security_events(event_type, severity, created_at desc);
create index if not exists worldway_security_events_correlation_idx
  on public.worldway_security_events(correlation_id);

revoke all on public.worldway_security_events from public, anon, authenticated;
grant select on public.worldway_security_events to authenticated;
