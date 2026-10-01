# Flights + Hotels + Buses: live booking and Worldway Wallet

## What exists today
- **Flights:** search, re-check, extras, Razorpay payment, a single booking request, booking lookup and staff-only cancellation are built. No real booking has been made yet.
- **Hotels and buses:** live search only. Nothing for booking, voucher or cancellation.
- **Worldway Wallet:** the wallet page keeps its balance **in the browser only** (a demo ledger), so it can't be used to pay. A real wallet has to be built on the server.
- **UP17 documentation** publishes the full hotel and bus steps: hotels (room info → block room → book → voucher → booking details → cancel → refund request) and buses (seat layout → boarding points → block seat → book → booking details → cancel).

## What gets built

### 1. Real Worldway Wallet (server-side)
- A wallet account per user, plus a ledger where entries can only be added, never edited: top-up, reservation, capture, release, refund.
- The balance is worked out from the ledger, never typed in.
- **Top-up with Razorpay:** money is added only after the payment is verified on the server (on return or by Razorpay's notice, whichever arrives first, applied once only).
- **Paying with the wallet:** funds are **reserved** before the booking goes to the partner, then **taken once** if the partner confirms, **released** if it refuses, and **kept reserved** if the result is unclear, until staff decide.
- The wallet page switches from the browser demo to this real ledger. Old browser-only entries are not carried over, because they were never real money.

### 2. One shared checkout for all three products
- One payment step: Razorpay directly **or** the Wallet.
- The same protections apply to flights, hotels and buses:
  - each booking request goes to the partner once only;
  - the price is checked again right before payment;
  - no automatic retry when the result is unclear (staff take over);
  - a booking shows as confirmed only when the partner has really confirmed it.
- Existing flight ranking, pricing and booking logic stays as it is. Flights simply gain the Wallet option.

### 3. Hotels
- Room choice → live re-check (block room) → guest details → payment → book → voucher.
- Booking details and customer cancellation where the partner's rules allow it.
- Refund requests go to staff.

### 4. Buses
- Seat map → boarding and drop-off points → passenger details → live seat hold (block seat) → payment → book → ticket.
- Booking details and cancellation where allowed.

### 5. Account and admin
- My account: one bookings list for flights, hotels and buses, showing Worldway references only.
- Admin: an unclear-result queue covering all three, plus wallet reversals and refunds, with every step in the audit log.

### 6. Verification
- Tests for: payment used once only, wallet reserve/take/release, refusal and timeout handling, and blocking duplicate bookings.
- Live searches only. No real bookings or payments.

## What will stay BLOCKED after this build
- **Certification for each product:** one real paid booking per product (flight, hotel, bus). I can't make card payments.
- Anything UP17 doesn't publish stays **UNSUPPORTED**: flight hold, void, reissue, flight refunds and the rest of the earlier list.

## Technical details
- New tables (with access rules and permissions): `wallet_accounts`, `wallet_ledger` (unique idempotency key, entry kinds topup/reserve/capture/release/refund), `up17_bookings` (product, state machine: pending_payment → paid → supplier_in_progress → confirmed | supplier_failed | supplier_uncertain | cancelled | refunded; unique payment/claim key).
- Wallet operations are database functions that run as one step and refuse to let the balance go below zero (`wallet_reserve`, `wallet_capture`, `wallet_release`), so two parallel bookings can't spend the same money twice.
- The partner calls for hotels and buses are added inside `src/lib/up17/up17.server.ts` using exactly the documented fields. The booking logic lives in a new `src/lib/up17/booking.server.ts` and reuses the existing Razorpay verification and payment claim.
- The partner's booking codes stay admin-only. Customers see Worldway references.
- The webhook is extended for wallet top-ups.

This is a large build, so it will run over several steps.
