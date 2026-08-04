# Partner API Readiness Report - Phase 8

Premium Partner Integration Preparation (Abercrombie & Kent, Crystal Cruises, any registered operator).
No partner website content was scraped or copied; every ingestion path requires partner-issued credentials.

## 1. Ingestion architecture
| Path | Implementation | Status |
| --- | --- | --- |
| REST catalogue + delta | runtime.server.ts (syncCatalogue) | Ready |
| OAuth2 / API-key / bearer / signed-session auth | runtime.server.ts | Ready |
| Rate limiting, retries, timeouts, TTL cache | runtime.server.ts | Ready |
| Authorised XML / JSON / CSV feed pull | feeds.server.ts (fetchFeed) | Ready |
| Partner-pushed feed (HMAC-SHA256) | routes/api/public/partner-feed.$partnerId.ts | Ready |
| Per-partner field mapping | registry.ts -> feed.fieldMap | Ready |
| Normalisation to one journey model | normaliseJourney | Ready |
| Health, sync logs, ops console | /admin/partners, /executive | Ready |

Push endpoint: POST /api/public/partner-feed/{partnerId} with header
`x-worldway-signature: sha256=<hex HMAC of raw body>`, 8 MB ceiling.
Unknown partner -> 404, secret not configured -> 503, bad signature -> 401 (verified).

## 2. Data model coverage
Journey carries itinerary days, departures with availability/seats, availability dates,
pricing/currency, group size and style, hotels/ships/rail, inclusions/exclusions, extensions,
hero + gallery + video, geo waypoints (route maps), documents (brochure, deck plan, terms),
FAQs, vessel/residence specification with cabin grades, reviews, ratings, interests.

## 3. Vertical templates (11)
templates.ts: luxury tours, expedition cruises, river cruises, ocean cruises, private journeys,
tailor-made, safari, villas, yachts, rail, polar. Each declares sections, spec chips,
transaction mode (instant-book / request-to-book / quote-only), facets, concierge priming,
schema.org type. components/partners/journey-template.tsx renders all of them from that config.

Verified in-browser (HTTP 200, 0 broken images, 0 console errors):
/journeys/CR-RHI-3101 river, /journeys/CR-GAL-3202 expedition, /journeys/AK-RAIL-3303 rail,
/journeys/AK-VIL-3404 villa, /journeys/AK-PRV-3505 private, /journeys/AK-TLR-3606 tailor-made,
/journeys/AK-EGY-1201 tours, plus /journeys and /executive.

## 4. Per-page capability matrix
Itinerary, maps (waypoint-driven), galleries, reviews, pricing, availability calendar,
group size, departure dates, quote requests (persisted to quote_requests), booking CTA per
transaction mode, AI Concierge hand-off with template-specific priming, SEO head + JSON-LD.

## 5. Activation checklist - what is still required
| Partner | Required to go live |
| --- | --- |
| Abercrombie & Kent | AK_CLIENT_ID, AK_CLIENT_SECRET (OAuth2); optional AK_FEED_WEBHOOK_SECRET for pushed XML feed; confirm production baseUrl and journey/departure field names, media licence |
| Crystal Cruises | CRYSTAL_API_KEY (X-Crystal-Key); optional CRYSTAL_FEED_WEBHOOK_SECRET; confirm voyage/fare/deck-plan fields and cabin-grade taxonomy |
| Other operators | Secrets named in each connector record (listed on /executive) |

Remaining work, only after credentials/contracts land:
1. Reconcile each declared fieldMap with the partner's real schema (one config edit per partner).
2. Enable booking write-back (booking, cancellation, amendment) against sandbox first.
3. Persist synced journeys to the database if inventory must outlive the in-memory TTL cache.
4. Swap demonstration records per vertical as live content arrives (they are badged and auto-replaced).
5. Confirm image and brochure redistribution rights per contract.

## 6. Quality gates
tsgo --noEmit: 0 errors. ESLint: 0 errors. Vitest: 7/7 passing (new XML/CSV/field-map/normalisation tests).
Browser audit: 9 routes, all 200, no console errors.
