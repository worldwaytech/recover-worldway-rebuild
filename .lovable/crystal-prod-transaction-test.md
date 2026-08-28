# Crystal / AKTG — Controlled PROD Transaction Test Report

Run date: 2026-08-28 (UTC) · Environment: PRODUCTION LIVE · Executed through the real
server adapter (`src/lib/crystal/aktg-booking.server.ts`), same code path as customers.
No credentials appear in this report; supplier audit entries are credential-free.

Rail state at test time: Shopping API LIVE · Booking API LIVE · `X-SalesChannel` and
`X-OfficeID` configured · all 19 documented operations armed · nine readiness gates GREEN.

## Voyage under test

| Field | Value |
|---|---|
| Voyage ID | CSE-009-260830 |
| Ship | Crystal Serenity (CSE) |
| Sail date | 2026-08-30 |
| Price type | FIT — FIT Regular Fare |
| Currency | USD |

## Step results

| # | Step | Operation (documented PROD path) | Result | Evidence |
|---|---|---|---|---|
| 1 | Rail arming | capability | PASS | Booking + Shopping LIVE, channel headers present |
| 2 | Search | Shopping voyage feed | PASS | live voyages returned (CSE-009-260830 among first 5) |
| 3 | Live availability / fare revalidation | `GET /d/v1/cruises/availability` | PASS (200, 919 ms) | per-category live fares & counts, e.g. GSVM Sapphire Veranda Suite USD 12,300 dbl, 25 available; CHV5 Crystal Penthouse USD 29,800 dbl, 0 available |
| 4 | Price types / currencies | `GET /v1/Bookings/pricetypescurrencies` | PASS (200) | FSL, WCF, GJF, COF, FIT — **all `isNetFare: false`** |
| 5 | Allocated suite lookup (source of `suiteNumber`) | `GET /d/v1/netfare/availablesuites` | **FAIL — supplier entitlement** | 400 BadRequest, errors: `SQL Error`, `Price type code not available`. Reproduced on 5 voyages × USD/EUR (10 calls) — channel-wide, not voyage-specific |
| 6 | Hold cabin | `POST /v1/Bookings/suites` | NOT RUN (blocked by 5) | `VoyageSuiteRequest` requires `suiteNumber` (int32); supplier returned none, and a suite number was not invented |
| 7 | Verify hold | `GET /d/v1/netfare/availablesuites` | NOT RUN | depends on 6 |
| 8 | Unhold | `DELETE /v1/Bookings/suites` | NOT RUN | nothing held — no inventory left active |
| 9 | Option / booking create | `POST /v1/Bookings/option` | NOT RUN | `VoyageSuite` requires `suiteCategoryCode` **and** `suiteNumber` |
| 10 | Retrieve | `GET /v1/Bookings/{bookingId}` | NOT RUN | no booking created |
| 11 | Cancel | `DELETE /v1/Bookings/{bookingId}` | NOT RUN | no booking created |
| 12 | Post-test inventory/booking sweep | `GET /v1/Bookings` | PASS (200) | agency booking list empty — zero test bookings, zero held suites |
| 13 | Promotions (supporting read) | `GET /d/v1/wsPromo/CruiseCategoryPromo` | Non-blocking 400 | `Invalid Price Type` — same net/promo price-type entitlement gap |

## Verdict

- Search → live availability → fare revalidation: **PASS**, fully live in production.
- Hold → verify → unhold and booking lifecycle: **BLOCKED at the supplier**, not in our code.

Single remaining blocker: our sales channel / office is not entitled to a **Net Fare
price type**, so `/d/v1/netfare/availablesuites` returns
`Price type code not available` and never yields an allocated `suiteNumber`. Every
mutating operation in the documented spec requires that field.

## Exact request for AKTG (Alberto)

For sales channel + office ID already configured for Worldway Travels Group, either:

1. enable a **Net Fare price type** (`isNetFare: true`) for our channel/office so
   `/d/v1/netfare/availablesuites` returns `suiteAvailability` with `suiteNumber`; or
2. confirm the correct PROD source of `suiteNumber` for **FIT** pricing, if allocated
   suites are served by a different endpoint for non-net-fare channels.

No configuration change is required on our side. The moment either is supplied, steps
6–11 (hold → verify → immediate unhold, then one test option → retrieve → immediate
cancel) run in a single pass with idempotency keys and immediate release.

## Safeguards preserved

Credentials stayed server-side; auth/RLS unchanged; idempotency keys generated per
attempt; fail-closed capability gate enforced on every call; LIVE configuration was not
modified during this test; no mutating supplier operation was executed.
