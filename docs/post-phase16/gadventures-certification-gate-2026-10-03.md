# G Adventures Certification Gate — 2026-10-03

## Current state

G Adventures is technically integrated and its live read APIs are reachable. The current application key is not production-booking certified.

The existing integration has already implemented the documented booking lifecycle and deliberately fails closed when supplier write scope is unavailable.

## Supplier-side blocker

The current G Adventures application key returns HTTP 403 for booking write resources. The existing production audit records:

- GET root: 200
- GET tour dossiers: 200
- GET departures: 200
- GET agency: 200
- booking write probe: 403
- customer write probe: 403
- booking read: 403

Therefore the blocker is **supplier authorization**, not missing Worldway booking code.

G Adventures documentation states that an application must be bound to an approved Agency Code for booking resources, and production release requires G Adventures to authorize the application for production. citeturn0search0turn0search1

## Certification evidence gate

Worldway requires:

1. credentials
2. search
3. availability
4. booking scope
5. booking
6. booking read
7. confirmation requirements
8. cancellation
9. failure/retry
10. idempotency

Sandbox evidence cannot promote production. Credential presence cannot promote production.

## Booking requirements

G Adventures exposes confirmation and check-in requirements per departure. Confirmation requirements can include age restrictions, date of birth, nationality, passport details and other supplier-defined requirements. Worldway must capture and validate only what the supplier requires for the selected departure. citeturn0search4

## No false certification

No production promotion is performed by this change.

The runtime supplier registry remains UAT until G Adventures grants the required write scope and the complete production lifecycle is actually evidenced.

## Official documentation

- https://developers.gadventures.com/docs/
- https://developers.gadventures.com/docs/tutorials/first-booking.html
- https://developers.gadventures.com/docs/booking_requirements.html
