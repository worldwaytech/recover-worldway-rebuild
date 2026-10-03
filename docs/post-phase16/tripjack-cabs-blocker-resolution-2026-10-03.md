# TripJack Cabs UAT Blocker Resolution Gate — 2026-10-03

## Current TripJack UAT account record

- Agency/User ID: `413369`
- Agency name: Worldway Travels Group
- UAT login/contact values are runtime-only server configuration and are not committed to the repository.

## Current finding

Worldway already has the documented TripJack Cabs UAT integration, including:

- Cabs UAT host `https://apitest-cabs.tripjack.com`
- documented Location Search endpoint `POST /cabs/v1/google-places`
- static-IP egress relay with fail-closed behavior
- server-only API key and agent credentials
- request/response evidence persistence with credential redaction
- certification sequence covering Location Search through cancellation and post-cancel Booking Details
- booking idempotency and supplier-response reconciliation

No supplier endpoint was changed speculatively.

## Blocker handling

The certification connectivity probe now classifies HTTP 401/403/404/503 and invalid non-JSON responses as **SUPPLIER-SIDE BLOCKED** for Cabs. A 503 is explicitly reported as an upstream access/product/egress blocker rather than a generic application error.

The 503 does **not** constitute certification failure evidence that can be silently bypassed, and it does not permit production promotion.

## Required operational verification

1. Run the authenticated Cabs Location Search probe from the configured Worldway deployment.
2. Confirm the request is routed through the configured static-IP relay when relay mode is enabled.
3. Capture the correlation ID, endpoint, HTTP status and sanitized response in `tripjack_api_logs`.
4. If HTTP 503 persists, provide TripJack the correlation ID and allow-listed egress IP and request confirmation that Cabs UAT is enabled for the API key.
5. Re-run Location Search after supplier confirmation.
6. Only after Location Search passes, continue Lat/Long → Quote → Booking → Payment → Booking Details → Amendment Charges → Cancel → post-cancel Booking Details.
7. Do not mark the supplier production-certified until the complete required lifecycle and resilience evidence exists.

## Safety

This gate changes diagnosis/evidence handling only. It does not bypass TripJack authorization, invent an endpoint, expose credentials, or promote the supplier.
