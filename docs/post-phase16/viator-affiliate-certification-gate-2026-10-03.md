# Viator Affiliate Certification Gate — 2026-10-03

Viator Affiliate has production search, availability and pricing code, plus a Worldway-collected payment flow for Affiliate Full + Booking.

Production promotion remains blocked until the complete affiliate lifecycle is evidenced.

## Required evidence
1. credentials
2. search
3. availability
4. affiliate booking entitlement
5. paid production booking
6. authoritative booking status
7. cancellation
8. refund outcome
9. failure/unknown-outcome resolution
10. idempotency

## Important payment rule

Affiliate Full + Booking uses Worldway payment collection. Viator's booking call must not receive a merchant payment submission mode. The customer payment and supplier booking remain separate controlled steps.

## Safety

- A booking timeout or 5xx is indeterminate, not automatically failed.
- The authoritative status endpoint is used to resolve an uncertain supplier booking.
- The booking must never be blindly submitted a second time.
- Production certification cannot be satisfied by sandbox evidence.
- The supplier catalog is not promoted merely because credentials exist.

## Current state

- Search: production-capable.
- Availability/price: production-capable.
- Affiliate booking entitlement: not certified.
- Paid production booking: not certified.
- Cancellation/refund: not certified.
- Failure resolution/idempotency: formal gate added; real production evidence still required.
- Supplier production promotion: not performed.