# AIR iQ Production Certification Gate — 2026-10-03

AIR iQ is used for Worldway pre-purchased/series flight fares. The existing connector supports authenticated sectors, availability, search, booking/ticketing and ticket retrieval.

The repository's API documentation states that no cancellation/refund endpoint is documented. Cancellation remains an offline flight-desk process and is not represented as a certified API capability.

## Required production evidence
1. Credentials and authenticated production access
2. Search
3. Availability
4. Live price validation
5. Real production booking/ticketing
6. Ticket retrieval/status confirmation
7. Failure/timeout resolution
8. Idempotency / duplicate-submission protection

## Existing safety controls
- Supplier credentials remain server-only.
- Customer-facing messages do not expose the supplier identity.
- Payment amount is server-authoritative and the fare is revalidated before ticketing.
- AIR iQ booking calls are explicitly non-retriable.
- A paid booking is atomically claimed before the supplier booking call, preventing concurrent duplicate submissions.
- Unknown booking outcomes enter "ticketing-unknown" and are resolved through ticket retrieval rather than blindly retried.
- Ticket retrieval is read-only and safely retryable.

## Cancellation limitation
No cancellation API certification is claimed. Cancellation/refund remains an operational flight-desk process.

## Current state
Production search is evidenced. Real production booking, ticket retrieval/status, failure-resolution and idempotency evidence remain uncertified.

No supplier-registry promotion or automatic ticketing enablement is performed by this gate.

## Operational next step
Run the authenticated AIR iQ production certification scenario with a controlled low-risk pre-purchased fare, capture every required evidence record, verify the returned ticket/PNR through the read endpoint, and test duplicate/unknown-outcome protections.
