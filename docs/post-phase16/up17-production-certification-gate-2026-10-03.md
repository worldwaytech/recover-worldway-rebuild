# UP17 Production Certification Gate — 2026-10-03

UP17 already has the shared Worldway booking engine for flights, hotels and buses. The engine uses conditional status transitions, a single supplier submission, live fare revalidation for flights, and an explicit supplier_uncertain state for unknown outcomes.

## Required production evidence
1. Credentials and authenticated production access
2. Search
3. Availability
4. Live price validation
5. Real production booking
6. Booking read/detail confirmation
7. Cancellation outcome
8. Modification outcome where the product permits modification
9. Failure/timeout resolution without duplicate submission
10. Idempotency evidence

## Promotion rule
Certification is fail-closed. Search, credentials, code presence, or a test booking cannot promote UP17 to production certification.

## Existing safety controls
- Customer-facing references remain Worldway references.
- Supplier booking identifiers remain server/admin controlled.
- Payment is claimed before fulfilment.
- Supplier submission is guarded by a conditional paid → supplier_in_progress transition.
- An already-claimed booking cannot be submitted again by a second fulfilment call.
- Supplier timeout/unknown outcomes become supplier_uncertain and are reconciled by staff rather than blindly retried.
- Flight fares are revalidated immediately before supplier booking.
- Existing supplier booking-detail and cancellation endpoints are available.

## Current state
Production search/availability/price are already evidenced.

Not yet certified: real production booking, booking read confirmation, cancellation/modification outcome, failure resolution evidence, and idempotency evidence.

No supplier registry promotion is performed by this gate.

## Operational next step
Run the authenticated UP17 production certification scenario using a controlled low-risk itinerary/product, capture every required evidence record, and only then consider supplier-registry promotion.
