create table if not exists public.worldway_travel_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  node_type text not null check (node_type in ('destination','supplier','traveller','experience','airport','hotel','route')),
  canonical_key text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, node_type, canonical_key)
);

create table if not exists public.worldway_travel_graph_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  from_node_id uuid not null references public.worldway_travel_graph_nodes(id) on delete cascade,
  to_node_id uuid not null references public.worldway_travel_graph_nodes(id) on delete cascade,
  edge_type text not null check (edge_type in ('located_in','serves','prefers','offers','connects','requires','compatible_with')),
  weight numeric,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.worldway_travel_intelligence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  kind text not null check (kind in ('condition','inventory','price','demand','knowledge')),
  subject_id text not null,
  value jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.worldway_commerce_network_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_key text not null,
  channel text not null check (channel in ('direct','partner_api','agent','enterprise')),
  capability text not null check (capability in ('discover','compare','quote','recommend','plan','hold','book','modify','cancel','refund')),
  subject_ids jsonb not null default '[]'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  decision jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, request_key)
);

create index if not exists idx_worldway_travel_graph_nodes_canonical on public.worldway_travel_graph_nodes (node_type, canonical_key);
create index if not exists idx_worldway_travel_graph_edges_from on public.worldway_travel_graph_edges (from_node_id);
create index if not exists idx_worldway_travel_graph_edges_to on public.worldway_travel_graph_edges (to_node_id);
create index if not exists idx_worldway_travel_intelligence_subject on public.worldway_travel_intelligence (subject_id, kind, captured_at desc);
create index if not exists idx_worldway_commerce_network_requests_tenant on public.worldway_commerce_network_requests (tenant_id, created_at desc);

alter table public.worldway_travel_graph_nodes enable row level security;
alter table public.worldway_travel_graph_edges enable row level security;
alter table public.worldway_travel_intelligence enable row level security;
alter table public.worldway_commerce_network_requests enable row level security;

comment on table public.worldway_travel_graph_nodes is 'Phase 16 canonical Worldway travel knowledge graph nodes; tenant_id isolates private traveller/partner data.';
comment on table public.worldway_travel_graph_edges is 'Phase 16 evidence-backed relationships across destination, supplier, traveller and travel-product graphs.';
comment on table public.worldway_travel_intelligence is 'Phase 16 normalized real-time and knowledge observations; source evidence is mandatory at the application layer.';
comment on table public.worldway_commerce_network_requests is 'Phase 16 governed network capability requests and deterministic authorization decisions.';
