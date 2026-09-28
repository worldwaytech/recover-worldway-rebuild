# Worldway Travel Commerce Engine — Audit and Build Order

## 1. What already exists (keep, don't rebuild)

- **Supplier registry**: provider table, manifest auto-registration, probes, sync runs, webhooks, audit logs, API & Sync Center.
- **Supplier connectors**: Crystal (production live), AIR iQ (live, 5% markup), HBX Hotels/Activities/Transfers, RateHawk, Viator Affiliate and Merchant, G Adventures, Bókun, TTC, A&K/All Journeys, Cruisea, TripJack Cabs/TripSafe, UP17, Razorpay.
- **Per-supplier pricing**: AIR iQ markup, RateHawk markup. Each is separate, and there is no shared engine.
- **Bookings and payments**: bookings, payments, installments, events and documents, with server-side saving, atomic payment recording and Razorpay checks.
- **Itinerary helper**: builds a day-by-day plan and departure dates from a single catalogue product. It invents the dates and prices, so it is not real inventory.
- **AI Concierge and Trip Builder**: both pass the request straight to an outside partner service. There is no Worldway requirements step, no search on our own inventory, and no RAG or memory.
- **Admin**: health pages, certification dashboards (TripJack, Viator) and readiness checks (Crystal).

## 2. What's missing

Requirements engine, a common inventory format, a capability registry (which supplier can search, hold, book or cancel), the trip graph and chronology/timezone checks, ranking of single items and whole packages, optimizer, orchestrator, auditor, a shared pricing engine (net + tax + FX + commission + markup), multi-proposal, edit → reprice → revalidate, failover and circuit breakers, booking-readiness gate, package versions, and cruise+land and aviation packaging.

## 3. Duplicates

- The pricing/markup logic is repeated for each supplier (AIR iQ, RateHawk, Viator voucher pricing).
- Readiness is checked in three different ways (Crystal, TripJack, Viator).
- `itinerary.ts` makes its own prices and dates, alongside the real supplier data.
- Supplier status is kept in two places: `partners/registry.ts` and `integration_providers`.

## 4. Supplier status (from the last audit)

| Status | Suppliers |
| --- | --- |
| Production live | Crystal, AIR iQ (no real booking made yet) |
| Sandbox or UAT only | HBX Hotels/Transfers, RateHawk, Viator Merchant, TripJack Cabs/TripSafe, G Adventures |
| Blocked on the supplier | Viator Affiliate booking, HBX production certificate, TripJack Cabs error 503 |
| Not tested | HBX Activities, UP17, TTC booking, Cruisea, Razorpay |

## 5. Build order (one stage at a time, with tests after each)

1. **Core types + capability registry.** Add a common format for flights, stays, activities, transfers, cruises, insurance and aviation. Each connector declares what it can do and its readiness (live, UAT, sandbox or blocked). Reads the existing registry, so no supplier logic goes into the engine.
2. **Adapters.** Thin adapters that wrap the existing clients into the common format: AIR iQ, HBX/RateHawk, Viator/G Adventures/TTC/Bókun, TripJack, Crystal. Each gets a timeout, retry, circuit breaker and cache.
3. **Trip graph + chronology checks.** Uses flight arrival time and the destination timezone to set hotel check-in (a 28 Sep departure landing 29 Sep gives a 29 Sep check-in). Detects clashes, impossible connections, missing transfers and travel that is too far or too long.
4. **Shared pricing engine.** net + taxes + FX + commission + markup = customer price, with each step recorded. Moves the AIR iQ and RateHawk markups onto it without changing the prices customers pay.
5. **Ranking + package assembly/optimizer/auditor.** Ranks complete journeys with a score breakdown you can read.
6. **Proposals, versions and edit → reprice → revalidate.** New tables: trip requests, packages, package versions, package items and package audit. All go through RLS and server functions.
7. **Booking-readiness gate + orchestrator.** A package can only be booked when every part comes from a production-approved supplier, has passed live revalidation and has an agreed price. Bookings use idempotency keys and are never retried automatically.
8. **AI layer.** The AI turns a request into requirements and explains the results, using the default AI model through the Lovable AI Gateway. It never produces prices, availability or schedules.
9. **Admin engine console + customer proposal page**, then cruise+land and aviation packaging.

## 6. Risks

- Real multi-supplier bookings are only possible for the production-live suppliers. Everything else stays proposal/enquiry only until the supplier approves us.
- The existing Concierge and Trip Builder depend on an outside partner service. The new engine will run next to them until you approve switching over.
- Live searches use supplier rate limits and paid web-reading credits, so results are cached.
- The build is large and will take several passes. No real bookings or charges will be made without your explicit approval.

## Technical details

New code goes in `src/lib/engine/`: `types.ts`, `capabilities.server.ts`, `adapters/*.server.ts`, `trip-graph.ts`, `chronology.ts`, `pricing.ts`, `ranking.ts`, `optimizer.ts`, `auditor.ts`, `orchestrator.server.ts`, `engine.functions.ts`, plus unit tests in `src/lib/engine/__tests__`. The migration adds `trip_requests`, `trip_packages`, `trip_package_versions`, `trip_package_items`, `trip_package_audit` and `pricing_rules`, with grants and RLS in the same migration. Existing supplier clients stay unchanged.
