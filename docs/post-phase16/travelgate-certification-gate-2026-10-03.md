# Travelgate certification execution gate

Travelgate is an integration candidate, not a certified production supplier.

## Required lifecycle

1. Credentials
2. Search
3. Quote
4. Book
5. Booking Read
6. Cancel
7. Failure/retry
8. Idempotency

The harness in `src/lib/engine/suppliers/travelgate/certification.ts` records step-level evidence and fails closed when any required step is missing.

## Promotion rule

Test evidence cannot promote Travelgate to production. Production promotion requires the complete production lifecycle report and a separate supplier-registry change backed by that evidence.

## Current state

- Adapter foundation: complete
- Certification harness: complete
- Test credentials: not configured in Worldway
- Production credentials: not configured in Worldway
- Production certification: not complete
- Runtime supplier catalog promotion: intentionally not performed

Travelgate's official HotelX documentation defines Search, Quote, Book and Booking Management operations and provides development/test credentials and test supplier data. Quote is the authoritative latest pricing/policy step before booking.
