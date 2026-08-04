# WorldwayLuxe — Production Baseline v1.0.0

Immutable release record. Rollback reference for all future development.

## Phase 2 — Baseline identifiers

| Item | Value |
| --- | --- |
| Release version | 1.0.0 (Production Baseline) |
| Git commit | `6add8492767c88903b90edeedfdd547ae7ff3850` |
| Prior validated commit | `f2396dda12cdd26aa0ff4e51987ff026a8c4b506` |
| DB migration version | `20260803_storage_objects_export_lockdown` (20 migrations applied) |
| Schema version | bookings + booking_events / _payments / _installments / _documents / _messages / _requests, notifications, profiles, user_roles, wallet ledger, partner registry |
| API version | Partner API v1 (WWL), Viator Partner v2, G Adventures (Sherpa) v1, MCP 1.0 |
| Build | TanStack Start v1 / Vite 7 / React 19 → Cloudflare Worker; `tsgo --noEmit` clean |
| Deployment timestamp | 2026-08-03T04:49Z |
| Environment | Lovable Cloud (Supabase `fhiyldxnfplirzwernwb`), custom domain worldwaytravelsgroup.com |
| Security policy version | SEC-2026.08.03 (booking-mutation lockdown + storage object lockdown) |

## Phase 1 — Release candidate certification

Post-deployment smoke test (production, all 200 unless noted):
`/` `/flights` `/hotels` `/activities` `/tours` `/destinations` `/journeys`
`/wallet` `/auth` `/admin` `/sitemap.xml` `/robots.txt`; `/search` → 307 (intentional
redirect to canonical query form).

- Migrations applied ✅ · RLS active on every user-data table ✅
- `staff_update_booking` RPC enforces `is_staff()`, raises `42501` otherwise ✅
- Customer permissions unchanged (own-row read/write only) ✅
- Payment protection: `amount_paid` / `balance_due` / `status` writable only via privileged RPC ✅
- Anti-forgery triggers active: `enforce_booking_event_actor`, `enforce_booking_message_author`,
  `enforce_booking_document_owner`, `prevent_tier_self_update` ✅
- Booking lifecycle, AI Concierge, search, wallet, admin console operational ✅

## Phase 3 — Security review

| Control | Status |
| --- | --- |
| RLS coverage | All public user-data tables enabled + policied |
| Privileged RPC | `staff_update_booking`, `is_staff`, `has_role` (self-scoped only) |
| SQL injection | No raw SQL from client; PostgREST + parameterised RPC |
| XSS | React escaping; no `dangerouslySetInnerHTML` on user content |
| CSRF | Bearer-token auth, no cookie-session mutations; webhooks HMAC-verified |
| Session handling | Supabase JWT, server revalidates via `getUser()` in `requireSupabaseAuth` |
| Authorization | Server-side role checks; `useVerifiedRole` is defence-in-depth only |
| Input validation | Zod `inputValidator` on every server function |
| Rate limiting | Edge/platform level; per-route app limiter is a debt item |
| Secrets | Server-only env; partner/Viator/G Adventures keys never in browser |

No remaining critical or high-severity findings. Resolved this release: private
`database_export_02_08_26` bucket had no `storage.objects` policies — now staff-only
for SELECT/INSERT/UPDATE/DELETE.

Remaining warnings (accepted, documented): three write-only `WITH CHECK (true)` policies on
contact/quote/analytics capture forms; four `SECURITY DEFINER` functions intentionally callable
by signed-in users (each performs its own authorization check); dependency advisories tracked
in the debt register.

## Phase 4 — Performance baseline (1280×1800, cold worker)

| Route | DCL (ms) | Load (ms) | FCP (ms) | H1 |
| --- | --- | --- | --- | --- |
| `/` | 248 | 298 | 400 | 1 |
| `/flights` | 1094 | 1118 | 1160 | 1 |
| `/tours` | 4486 | 5424 | 4600 | 1 |
| `/activities` | 315 | 339 | 440 | 1 |
| `/destinations` | 103 | 147 | 124 | 1 |

Production TTFB across the smoke set: 0.38–0.91 s. CLS: no layout-shift entries recorded;
INP not measurable without synthetic interaction traffic. Zero uncaught page errors.

Service latencies (observed): search 0.4–1.2 s (partner round-trip bound), tours hydration
up to 5 s cold / <1 s warm cache, booking write <500 ms, wallet transaction <400 ms,
AI Concierge first token 1–3 s.

## Phase 5 — Technical debt register (by impact)

| # | Item | Impact | Notes |
| --- | --- | --- | --- |
| 1 | `/tours` cold hydration ~5 s | High | Pre-warm dossier cache / paginate first paint |
| 2 | No app-level rate limiting on public server fns | High | Add token bucket on search + inquiry endpoints |
| 3 | Dependency advisories (supply-chain scan) | Medium | Schedule upgrade window |
| 4 | Route-guard duplication across `/admin`, `/agent`, `/b2b` | Medium | Consolidate under one pathless layout |
| 5 | Aviation inquiries missing explicit anon insert policy | Medium | Confirm intended submission path |
| 6 | LCP element not attributed on several routes | Medium | Mark hero image as LCP candidate, add `fetchpriority` |
| 7 | Accessibility: focus rings, dropdown ARIA on autocomplete | Medium | Keyboard-only pass |
| 8 | SEO: canonical + JSON-LD not yet on every leaf collection route | Medium | Extend the tours pattern |
| 9 | Image weight on collection cards | Low | Responsive `srcset` / AVIF |
| 10 | Duplicated collection route boilerplate (36 verticals) | Low | Generator or shared factory |
| 11 | Legacy demo/seed modules still shipped | Low | Tree-shake or delete |

No new features were implemented in this phase.

## Phase 6 — Enterprise roadmap readiness

| Capability | Readiness | Gap |
| --- | --- | --- |
| Multi-supplier integration | High | Connector registry + 11 vertical templates exist; needs per-supplier SLA monitoring |
| Enterprise supplier registry | High | `partners/registry.ts` live; needs DB-backed CRUD + audit |
| Connector SDK | Medium | REST/XML/JSON/CSV + HMAC push ingestion done; no versioned public SDK package |
| Dynamic packaging | Medium | Itinerary engine + pricing exist; no cross-vertical bundling/margin engine |
| Corporate / B2B portal | Medium | `/b2b` shell, policies, team, reports scaffolded; no cost centres or approval chains |
| Loyalty platform | Medium | Wallet + membership tiers live; no points accrual/redemption ledger |
| CRM | Medium | `/admin/crm` present; no lifecycle automation or segmentation |
| Marketplace APIs | Medium | MCP server + public API routes exist; needs API keys, quotas, docs portal |
| Advanced analytics | Low | Event capture only; no warehouse or dashboards |
| Revenue intelligence | Low | Requires margin + supplier cost data model first |

## Risk assessment & rollback

- **Primary risk:** upstream partner API availability (historic 502s at worldwayluxe.com).
  Mitigation: no synthetic inventory — failures surface honestly.
- **Secondary risk:** cold-start latency on tours hydration.
- **Rollback reference:** redeploy commit `6add8492767c88903b90edeedfdd547ae7ff3850`.
  Migrations in this release are additive policy grants and are safe to leave in place on rollback.