# HBX Hotels mTLS Gate — 2026-10-03

## Purpose

Implement the missing security transport required before HBX Hotel Booking API certification.

HBX states that mutual TLS is required for hotel availability, CheckRate, booking confirmation, booking list/detail, booking changes, booking cancellation and booking reconfirmation.

## Implemented

- Server-only HTTPS mTLS transport.
- Dedicated test endpoint: `https://api-mtls.test.hotelbeds.com`.
- Dedicated production endpoint: `https://api-mtls.hotelbeds.com`.
- Existing HBX API-key + SHA-256 signature remains required.
- Client certificate, private key and CA certificate are server-side secrets.
- Fail-closed credential detection.
- No browser/client exposure of certificate material.
- No automatic promotion to production.

## Required secrets

- `HBX_HOTEL_API_KEY`
- `HBX_HOTEL_SECRET`
- `HBX_HOTEL_MTLS_CERT`
- `HBX_HOTEL_MTLS_KEY`
- `HBX_HOTEL_MTLS_CA`

## Remaining certification

The transport is implemented, but certification still requires actual HBX TEST evidence for availability, CheckRate, booking, booking read/detail, cancellation and the applicable change/reconfirmation cases, followed by HBX production certification.

Rate/booking evidence is never inferred from credential presence.

## Official documentation

- https://developer.hotelbeds.com/documentation/hotels/knowledge-base/mutual-authentication/
- https://developer.hotelbeds.com/documentation/hotels/knowledge-base/certification-process/
