-- Worldway AI memory. User-owned, consent-gated and provenance-aware.
create table if not exists public.travel_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_kind text not null check (memory_kind in ('explicit','behavioral','journey','inferred','session')),
  memory_key text not null,
  value jsonb not null,
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  source text not null check (source in ('user','booking','interaction','system_inference')),
  source_ref text,
  consent_scope text not null check (consent_scope in ('preferences','history')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_memory_no_session check (memory_kind <> 'session'),
  constraint travel_memory_inferred_source check (memory_kind <> 'inferred' or source = 'system_inference')
);

create unique index if not exists travel_memory_user_key_idx
  on public.travel_memory(user_id, memory_kind, memory_key);

create index if not exists travel_memory_user_updated_idx
  on public.travel_memory(user_id, updated_at desc);

create index if not exists travel_memory_expiry_idx
  on public.travel_memory(expires_at)
  where expires_at is not null;

alter table public.travel_memory enable row level security;

drop policy if exists "Users read own travel memory" on public.travel_memory;
create policy "Users read own travel memory"
  on public.travel_memory for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own travel memory" on public.travel_memory;
create policy "Users create own travel memory"
  on public.travel_memory for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.travel_dna
      where travel_dna.user_id = auth.uid()
        and (
          (travel_memory.consent_scope = 'preferences' and travel_dna.consent_preferences = true)
          or
          (travel_memory.consent_scope = 'history' and travel_dna.consent_history = true)
        )
    )
  );

drop policy if exists "Users update own travel memory" on public.travel_memory;
create policy "Users update own travel memory"
  on public.travel_memory for update to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.travel_dna
      where travel_dna.user_id = auth.uid()
        and (
          (travel_memory.consent_scope = 'preferences' and travel_dna.consent_preferences = true)
          or
          (travel_memory.consent_scope = 'history' and travel_dna.consent_history = true)
        )
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.travel_dna
      where travel_dna.user_id = auth.uid()
        and (
          (travel_memory.consent_scope = 'preferences' and travel_dna.consent_preferences = true)
          or
          (travel_memory.consent_scope = 'history' and travel_dna.consent_history = true)
        )
    )
  );

drop policy if exists "Users delete own travel memory" on public.travel_memory;
create policy "Users delete own travel memory"
  on public.travel_memory for delete to authenticated
  using (auth.uid() = user_id);

comment on table public.travel_memory is 'Worldway AI travel memory. Consent-gated, provenance-aware and user-owned.';
