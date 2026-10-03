# HBX Transfers Certification Gate — 2026-10-03

## Scope

HBX Transfers already has a server-only adapter, live availability, booking, booking read, cancellation, persistence, voucher generation, outcome recovery and an admin-only HBX TEST certification runner.

This gate formalizes the promotion contract. It does not claim that HBX Transfers is production-certified.

## Required promotion evidence

All of the following are required in the same target environment:

1. credentials
2. search / availability
3. price evidence from live availability
4. successful booking
5. booking read / authoritative status retrieval
6. cancellation
7. failure/retry evidence
8. idempotency evidence

Production promotion is accepted only for environment `live` and only when every required step is passed.

## Existing safety controls

- Supplier booking POST is single-attempt because it is non-idempotent at the transport layer.
- Worldway persists an idempotency key before supplier submission.
- Repeated customer requests return the existing Worldway booking instead of creating another supplier booking.
- If the supplier response is lost, the system resolves the booking by `clientReference` and does not resubmit.
- Cancellation is single-attempt and authoritative state is re-read if the DELETE result is unsuccessful.
- Voucher generation requires supplier status `CONFIRMED`.
- Supplier credentials and supplier transport remain server-only.

## Current state

- Adapter: implemented.
- Availability: implemented.
- Booking lifecycle: implemented.
- Booking read: implemented.
- Cancellation: implemented.
- Admin TEST certification runner: implemented.
- Formal certification report/assertion: implemented.
- Production certification: **not complete**.
- Supplier registry promotion: **not performed**.

The formal gate is intentionally fail-closed. Passing unit-test evidence or HBX TEST evidence cannot promote the supplier to production.

## Next operational step

Run the existing admin HBX TEST transfer certification runner and capture real evidence for the required lifecycle. Then add the resulting certification evidence only after the corresponding environment is actually exercised.
