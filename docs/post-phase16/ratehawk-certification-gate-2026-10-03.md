# RateHawk Certification Gate — 2026-10-03

## Scope

RateHawk is an existing Worldway hotel supplier in UAT. This implementation adds the production-certification execution foundation without promoting RateHawk to production.

## Implemented

- Server-only RateHawk API v3 transport.
- Explicit sandbox and production endpoints.
- Server-only credentials: `RATEHAWK_KEY_ID` and `RATEHAWK_API_KEY`.
- Operation map for search, hotel-page rate retrieval, prebook, booking form/finish/status, booking read and cancellation.
- Evidence-driven certification report.
- Fail-closed production assertion.
- Test/sandbox evidence cannot promote the supplier to production.

## Certification lifecycle

The execution gate requires:

1. credentials
2. search
3. price/rate validation
4. prebook
5. booking
6. booking read/status
7. cancellation
8. failure/retry evidence
9. idempotency evidence

Production promotion additionally remains subject to the repository's supplier certification policy, including security/privacy, supplier identity isolation, health/SLA evidence and a recorded production certification decision.

## Current state

RateHawk remains **UAT / not production-certified**. No runtime catalog promotion is performed by this change.

Credentials are not embedded in source control and no production booking is claimed by this implementation.

## Vendor API notes

The ETG API v3 documentation identifies separate sandbox and production endpoints, HTTP Basic authentication, prebook before booking, an asynchronous booking flow, booking retrieval and cancellation. Prebook is recommended to revalidate rate availability and pricing before booking.

Sources:

- ETG API v3 Integration Guide: https://docs.emergingtravel.com/docs/integration-guide/
- ETG API v3 Prebook: https://docs.emergingtravel.com/docs/b2b-api/hotel-search/prebook-rate-from-hotelpage-step/
- ETG API v3 Cancel: https://docs.emergingtravel.com/docs/b2b-api/post-booking/cancel-booking/
