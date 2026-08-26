# Crystal Cruises / AKTG — Technical Handoff (for AKTG review)

**Integration status (internal):**

- SHOPPING API: **PRODUCTION LIVE**
- BOOKING API: **PRODUCTION LIVE** (all nine readiness gates green; ApiKey entitled,
  X-SalesChannel / X-OfficeID configured server-side, egress confirmed, certification
  recorded, `CRYSTAL_BOOKING_ENABLED=true`)

Base URL: `https://api.aktravelgroup.com/shopping`
Authentication: `ApiKey` request header, value read server-side only from the
`CRYSTAL_AKTG_API_KEY` runtime secret. The key never appears in frontend code,
URLs, logs, audit entries or source control.

## Architecture

| Layer | File | Responsibility |
|---|---|---|
| Raw supplier client | `src/lib/crystal/aktg-client.server.ts` | One function per documented Production operation; retries (429/5xx, 3 attempts), 120s timeout, per-operation caching, credential-free audit trail |
| Composition / normalisation | `src/lib/crystal/aktg.server.ts` | Merges voyages + prices/promotions + availability + reference data into Worldway domain models |
| Server functions | `src/lib/crystal/crystal.functions.ts` | `getCrystalVoyages`, `revalidateCrystalVoyage` (live price/availability revalidation) |
| Client inventory | `src/lib/crystal/inventory.ts` | Hydrates loader data into the storefront store |
| Admin connector | `src/lib/crystal/connector.server.ts` | Health, sync, status (exposes the two statuses above) |

## Documented Production operations

| YAML operation | Path | Implemented | Worldway usage |
|---|---|---|---|
| get-voyages | `/d/v1/products/cruises` | Yes | Primary catalogue: 185 voyages, itineraries, media, maps |
| prices and promotions | `/d/v1/cruises/pricespromotions` | Yes | **Primary structured pricing source**: fares, promos, deposits, penalties |
| get-price-suite-availability | `/d/v1/cruises/availability` | Yes | Live suite counts + fare revalidation before quoting |
| get-cruise-suite-category-prices-json | `/v1/cruiseprices` | Yes | Per-grade fare fallback / cross-check |
| get-ship-suite-categories | `/d/v1/cruises/suitecategories` | Yes | Suite grade taxonomy |
| get-available-destinations | `/d/v1/products/destinations` | Yes | Destination hubs and facets |
| get-ports | `/d/v1/cruises/ports` | Yes | Port geography, coordinates, imagery |
| get-price-types | `/d/v1/general/pricetypes` | Yes | Fare-type reference |
| voyage price types | `/d/v1/cruises/voyagepricetypes` | Yes | Published fare types per voyage |
| promotions (promoCrystalNew) | `/d/v1/wsPromo/promoCrystalNew` | Yes | Promotion catalogue and terms |
| price-feed-flat-file | `/v1/flatfiles/cruiseprices` | Yes — **reconciliation only** | Never used for catalogue sync or customer-facing data |
| package experience (`experienceTEST`) | `/d/v1/wsPackage/experienceTEST` | Client method exists, **not exposed** | Hidden from all customer and admin surfaces pending AKTG production approval |

## Booking capability

The supplied OpenAPI specification contains **no** booking, reservation, hold,
confirmation, modification, cancellation or payment operation. None has been
invented, mocked or simulated. Crystal enquiries terminate at the quote/booking
request boundary (`/crystal-cruises/quote`), which is the adapter seam ready for
AKTG's official Booking/Reservation API. Existing Razorpay and Viator payment
orchestration is untouched and does not route Crystal supplier bookings.

## Security controls

- API key server-only; enforced by `*.server.ts` import protection.
- No supplier credentials in audit entries, error messages or client payloads.
- Supplier media proxied/encoded; no credentialed URLs exposed.
- Fail-closed: without the key the module reports unconfigured rather than
  producing synthetic inventory.

## Verification

TypeScript check, production build and the full regression suite are run against
this integration; Crystal customer routes (index, search, voyage detail,
destinations, ships, quote) all render live Production data.

## Outstanding from AKTG

1. Booking/Reservation API (hold, confirm, modify, cancel, payment) specification
   and credentials.
2. Written confirmation whether `experienceTEST` is production-approved before it
   is surfaced anywhere.
3. Confirmation of rate limits / caching expectations for the structured
   endpoints.
