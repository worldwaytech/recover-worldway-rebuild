<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Architecture rules live in per-folder AGENTS.md (src/lib/engine, aviation, travelshop, confidentiality, ai) — read the one for the folder you touch.
- Suppliers plug in only via adapters to src/lib/engine; every external/browser response passes the confidentiality layer — no supplier leaks.
- Live commerce has one home: src/lib/commerce/commerce.server.ts (Concierge + partner API /api/public/v1/commerce/$op; HMAC-peppered keys/OAuth, scopes, rate limits) — no duplicate engines.
- Admin console reads live via src/lib/admin/console.functions.ts (is_staff; Travel DNA Super Admin + audited) — no sample data.
- Journey marketing content comes from src/lib/all-journeys.functions.ts, never imported by routes — keeps operator content out of the bundle.
- UP17 flight/hotel/bus bookings share one engine (src/lib/up17/booking.server.ts + travel_bookings): live-priced intent → Razorpay or Worldway Wallet → conditional-status claim → one supplier call → confirmed only on genuine supplier confirmation; unclear results go to /admin/travel-bookings, never retried — prevents double bookings and fake confirmations.
- Worldway Wallet is server-side only (wallet_accounts + append-only wallet_ledger, mutated solely via service-role wallet_topup/reserve/settle/refund functions) — the old browser ledger (src/lib/wallet-ledger.ts) is not money.
- Crystal online booking = deposit checkout through the shared paid-booking engine (src/lib/crystal/deposit.server.ts → travel_bookings product "cruise"): Crystal's own option % in supplier currency, live FX lock to INR, Razorpay within RAZORPAY_MAX_TXN_INR (default ₹5,00,000) else Wallet, one atomically-claimed Option call; Crystal write calls are never auto-retried — no unpaid or duplicate supplier bookings.
