# Roadmap

## In progress
- [ ] Complete the Universal API Management & Product Sync Center: resolve audited security and data-integrity findings, replace production-facing demo controls, harden roles/webhooks/audit, connect the product ledger, and verify all supported providers.
- [ ] Harden booking/payment creation, cancellation, deletion, payment recording and user administration with server-authoritative operations and durable audit trails.
- [ ] Add provider/product provenance and staff controls across all applicable product surfaces without changing public customer flows.
- [ ] Validate schema/RLS/foreign keys, supplier fail-closed behavior, automated sync, tests, authenticated workflows and production build.
- [ ] TTC catalogue import: finish all 856 verified tours (background resumable importer running; brands remaining: Contiki, AAT Kings, Brendan; Costsaver discovery returns 0 URLs).
- [ ] Validate TTC pages, catalogue data, API fail-closed behaviour, tests, typecheck, build; report final per-brand counts.

## Done
- [x] Audit current Admin/Super Admin, database, products, suppliers, bookings and API architecture; identify Universal Sync Center implementation, gaps and risks.
- [x] Imported the WorldwayLuxe "All Journeys" catalogue (263 journeys, 38 destinations) into /all-journeys with listing + detail pages and JOURNEYS → ALL JOURNEYS nav entry.

## Queued
- [ ] (superseded) Import the WorldwayLuxe "All Journeys" catalogue (https://worldwayluxe.com/all-journeys) into a new JOURNEYS → ALL JOURNEYS tab: full journey records (images, descriptions, destinations, regions, styles, interests, duration, group size, pricing, status, day-by-day itineraries, inclusions/exclusions, tags, source IDs, metadata), premium listing + detail pages with search/filter/sort, responsive and SEO-ready. Verify source vs destination counts afterwards.

## TripJack
- [x] Read-only audit of Cabs + TripSafe integration vs uploaded docs (no code changes)

## Admin Control Center upgrade (2026-09-25)
- [x] Supplier manifest: UP17, TripJack Cabs/TripSafe, Viator Merchant, Bókun, Razorpay, Firecrawl, AIRIQ (disabled) auto-register in Sync Center/health
- [x] Super Admin API health reads real supplier states
- [ ] Real API Management page (replace browser demo keys/webhooks), usage limits + kill switch tables
- [ ] Backend feature flags/audit on Super Admin; real overview tiles; generated admin menu
- [ ] Firecrawl usage panel
- [ ] AIRIQ — blocked on API docs + credentials
