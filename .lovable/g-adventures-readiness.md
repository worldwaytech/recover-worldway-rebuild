# G Adventures (REST) — Final API Audit & Production Readiness Report

Audited against the current official documentation only
(`booking_resources.html`, `tutorials/first-booking.html`, `booking_requirements.html`, `api_reference.html`).
No supplier bookings, payments, or cancellations were created.

## 1. Existing implementation (kept, not rebuilt)

| Area | Location | Verdict |
|---|---|---|
| REST client, auth, retries, timeouts | `src/lib/tours.server.ts` (`gFetch`) | Correct — `X-Application-Key` server-side only, 20s timeout, retry on 429/5xx only |
| Configuration / environment gating | `src/lib/tours.server.ts` | Correct — `TOURS_API_KEY`, `TOURS_AGENCY_CODE`, `TOURS_API_ENV` |
| Catalogue: dossiers, search, taxonomy, deals | `tours.server.ts`, `tours-taxonomy.server.ts` | Correct, live |
| Departures + availability revalidation | `tours.server.ts` | Correct, fails closed when not bookable |
| Write-scope probe & classification | `tours.server.ts`, `tours-scope.ts` | Correct |
| Webhook receiver | `src/routes/api/public/tours-webhook.ts` | Correct — shared-secret verified |
| Server functions | `src/lib/tours.functions.ts` | Rewired to the documented lifecycle |

## 2. Documented gaps found — and fixed

The previous booking implementation did not match the documented flow. It created a
booking with nested agency/customer objects, created services under
`/bookings/{id}/services`, and confirmed via a non-existent
`POST /bookings/{id}/confirmation`.

New module `src/lib/tours-booking.server.ts` implements the documented lifecycle:

1. `POST /bookings` — container only (`currency`, `external_id`).
2. `POST /customers` — one per traveller (legal name, title, email, DOB, nationality).
3. `POST /departure_services` — `booking.id`, `product.id`, `customers[]`, `rooms[]`.
   Service is created as **Option** with the supplier's option expiry and deposit.
4. Confirmation — `incomplete_requirements` of type `CONFIRMATION` must be empty,
   then `PATCH /departure_services/{id}` `{status:"Confirmed"}`, then a **re-read**;
   confirmation is reported only when the supplier itself returns `Confirmed`.
5. Cancellation — honours `status_transitions`, `PATCH {status:"Request Cancellation"}`,
   then re-read; success only on `Request Cancellation`/`Cancelled`.
6. Retrieval — booking plus services, invoices, payments, refunds, documents, checkins.
7. Requirements & penalties — `/requirements/*`, departure requirement sets,
   `/cancellation_terms/*`.
8. Amendments — `PATCH /customers/{id}` for DOB, nationality, passport number/expiry.

Exposed via server functions: `reserveTourDeparture`, `confirmTourReservation`,
`cancelTourReservation` (admin), `getTourReservation` (admin),
`getTourDepartureRequirements`, `updateTourTraveller` (admin).

## 3. Safe verification performed (read-only, PROD)

| Check | Result |
|---|---|
| `GET /` root | 200 — agency approved, "REST FULL Booking API" |
| `GET /tour_dossiers` | 200 — 2,094 dossiers |
| `GET /departures` | 200 — 1,316,966 departures |
| `GET /agencies/{code}` | 200 — Worldway Travels Group |
| Departure requirement set (dep. 420482) | 200 — DATE_OF_BIRTH, NATIONALITY, AGE_RESTRICTED, PASSPORT_NUMBER |
| `/cancellation_terms/{id}` | 200 |
| `GET /bookings` list | 200 — empty |
| `POST /bookings` (deliberately invalid, no booking created) | **403 permission denied** |
| `POST /customers` (deliberately invalid, no customer created) | **403 permission denied** |
| `GET /bookings/{id}` | 403 — booking scope not granted |

Automated coverage: `src/lib/__tests__/tours-booking.test.ts` (7 tests) asserts the
documented call order, 403 handling, confirmation gating on outstanding requirements,
supplier-truth confirmation, and cancellation transition rules. Full suite: 101 passing.

## 4. Blocker

The application key is **READ_ONLY**. Every write endpoint (`/bookings`,
`/customers`, `/departure_services`, booking reads) returns HTTP 403
"You do not have permission to perform this action.", despite the root resource
advertising full booking rights. Only G Adventures can enable write/booking scope
on this application key + agency code. No code change can bypass this, and the
integration deliberately does not fake holds: travellers are captured for the desk
with a clear message when the supplier refuses the write.

## 5. Final status

**TECHNICALLY INTEGRATED / PRODUCTION BOOKING PENDING**

Everything documented is implemented, tested, and fail-closed. Live booking activates
with no further code changes as soon as G Adventures grants booking scope to the key
(verify with the admin diagnostics on `/admin/tours`, which report `BOOKING_ENABLED`).
