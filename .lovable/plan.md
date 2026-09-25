# Admin / Super Admin Control Center upgrade

Keep the current admin look (dark, gold, left menu) exactly as in the screenshot. Nothing already working (bookings, supplier flows, customer pages) is rebuilt.

## What the audit found

- The API & Sync Center already exists and is backend-driven, but only 10 suppliers are registered in it: Crystal, TTC, HBX Hotels/Activities/Transfers, RateHawk, G Adventures, Viator, A&K, Cruisea.
- Missing from it: UP17, TripJack (Flights, TripSafe, Cabs), Viator Merchant (sandbox), Bókun, Razorpay (payments monitor), Firecrawl.
- AIRIQ has no code in the project at all. No endpoints, credentials or docs exist, so it can only be added as "Not connected" until you supply its API docs and keys.
- "API Management" page (keys, webhooks) is browser-only demo data, not real.
- Super Admin "API health" box is hard-coded "Operational"; feature flags, audit and "Reset all data" are browser-only.
- Admin overview tiles partly read browser data (Users shows 0).

## What will be built

1. **Automatic supplier registration** – every supplier module declares itself once (name, category, secrets it needs, health check, sync, webhook). The Control Center, connectors list, sync scheduler, monitoring and admin menu all read from that one list, so a new supplier appears everywhere with no screen changes. Menu entries for supplier pages are generated from it.
2. **Register all missing suppliers** – UP17, TripJack ×3, Viator Merchant, Bókun, Razorpay, Firecrawl, plus AIRIQ as a disabled placeholder.
3. **Real API Management** – replace demo keys/webhooks with backend data: per-supplier credential status (names only, never values; secure form to add/rotate), webhook endpoints with signing status and recent deliveries, usage limits (requests/min, daily cap, kill switch) enforced on the server.
4. **Health & monitoring** – real health probe per supplier (read-only, never books), last-checked time, latency, error rate, 24h call counts; Super Admin health box shows real states instead of "Operational".
5. **Sync** – schedules, retries with backoff, run history and per-product sync for every supplier that supports sync; suppliers without a catalogue show "Not applicable".
6. **Firecrawl / Web Intelligence panel** – usage, recent crawl jobs, failures, and on-demand re-crawl for the existing TTC content pipeline.
7. **Audit trail** – every admin action (credential change, toggle, sync, limit change) written to the backend audit log; Super Admin audit and feature flags move to the backend; "Reset all data" becomes clearly local-only or removed.
8. **Overview tiles** – Users/Agents/Bookings/Revenue read from real backend data.

## Safeguards

- Supplier names stay on admin pages only; customer pages unchanged.
- No production bookings; health checks are read-only; sandbox stays sandbox.
- Secrets only in secure storage; never shown in the browser or logs.
- Existing bookings and records are preserved; database changes are additive.

## Verification

Full test suite, type check, build, and a signed-in Super Admin click-through of the Control Center (needs your permission to sign the preview in as worldwaytravelsgroup@gmail.com).

## Technical details

- New `src/lib/integrations/manifest.ts` (client-safe descriptors) + `*.server.ts` adapter map; `seedProviders` upserts from the manifest.
- New tables: `integration_usage_limits`, `integration_usage_counters`, `integration_webhook_endpoints`, `admin_feature_flags` (with GRANTs + staff-only RLS); reuse `integration_logs`, `integration_audit`, `admin_audit_log`.
- Limits checked in the shared outbound-call wrapper; kill switch returns fail-closed.
- `admin.api.tsx` and `admin.super.tsx` switched to server functions guarded by `has_role`.

## Open question

AIRIQ: please share its API documentation and credentials if you want it live; otherwise it stays a disabled placeholder.
