-- Worldway Security + Knowledge Fabric foundation
-- Distributed rate limiting and provenance-first knowledge storage.
-- No secrets or customer content are stored in the rate-limit key.

create table if not exists public.worldway_rate_limit_buckets (
  key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.worldway_rate_limit_buckets enable row level security;

revoke all on table public.worldway_rate_limit_buckets from public, anon, authenticated;

create or replace function public.worldway_consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_started timestamptz;
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'invalid rate limit key';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.worldway_rate_limit_buckets(key, window_started_at, request_count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set window_started_at = case
          when public.worldway_rate_limit_buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else public.worldway_rate_limit_buckets.window_started_at
        end,
        request_count = case
          when public.worldway_rate_limit_buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else public.worldway_rate_limit_buckets.request_count + 1
        end,
        updated_at = v_now
  returning window_started_at, request_count into v_started, v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.worldway_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.worldway_consume_rate_limit(text, integer, integer) to service_role;

create index if not exists worldway_rate_limit_buckets_updated_idx
  on public.worldway_rate_limit_buckets(updated_at);

create table if not exists public.worldway_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('official','supplier','worldway','web','document','regulatory')),
  canonical_url text,
  title text not null,
  content_hash text not null,
  language text not null default 'en',
  trust_tier smallint not null default 3 check (trust_tier between 1 and 5),
  status text not null default 'active' check (status in ('active','published','stale','archived')),
  fetched_at timestamptz,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, content_hash)
);

create table if not exists public.worldway_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.worldway_knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  content_tsv tsvector,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.worldway_knowledge_evidence (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.worldway_knowledge_documents(id) on delete cascade,
  chunk_id uuid references public.worldway_knowledge_chunks(id) on delete set null,
  claim_key text not null,
  claim_value jsonb not null,
  observed_at timestamptz not null default now(),
  valid_until timestamptz,
  confidence numeric(4,3) not null default 0.500 check (confidence between 0 and 1),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.worldway_knowledge_documents enable row level security;
alter table public.worldway_knowledge_chunks enable row level security;
alter table public.worldway_knowledge_evidence enable row level security;

revoke all on public.worldway_knowledge_documents, public.worldway_knowledge_chunks, public.worldway_knowledge_evidence from public, anon, authenticated;

create or replace function public.worldway_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_staff(auth.uid()), false);
$$;

revoke all on function public.worldway_is_staff() from public, anon;
grant execute on function public.worldway_is_staff() to authenticated;

create policy "staff can read knowledge documents"
  on public.worldway_knowledge_documents for select to authenticated
  using (public.worldway_is_staff());

create policy "staff can read knowledge chunks"
  on public.worldway_knowledge_chunks for select to authenticated
  using (public.worldway_is_staff());

create policy "staff can read knowledge evidence"
  on public.worldway_knowledge_evidence for select to authenticated
  using (public.worldway_is_staff());

create index if not exists worldway_knowledge_documents_status_idx
  on public.worldway_knowledge_documents(status, updated_at desc);
create index if not exists worldway_knowledge_documents_source_idx
  on public.worldway_knowledge_documents(source_type, trust_tier);
create index if not exists worldway_knowledge_chunks_document_idx
  on public.worldway_knowledge_chunks(document_id, chunk_index);
create index if not exists worldway_knowledge_chunks_tsv_idx
  on public.worldway_knowledge_chunks using gin(content_tsv);
create index if not exists worldway_knowledge_evidence_claim_idx
  on public.worldway_knowledge_evidence(claim_key, observed_at desc);
create index if not exists worldway_knowledge_evidence_validity_idx
  on public.worldway_knowledge_evidence(valid_until);
