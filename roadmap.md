# Roadmap — Flights + Hotels + Buses live booking & Wallet
- [x] DB: wallet_accounts, wallet_ledger, travel_bookings + atomic wallet functions
- [x] Wallet server functions + Razorpay top-up verified once (return + webhook)
- [x] Wallet page switched to real ledger
- [x] UP17 hotel calls per docs (live-checked: rooms)
- [x] UP17 bus calls per docs (live-checked: seats, points)
- [x] Shared booking engine (claim once, uncertain → staff, wallet reserve/capture/release)
- [x] Flights: wallet payment option
- [x] Hotel + bus booking UI
- [x] Account bookings list/detail; admin queue (/admin/travel-bookings)
- [x] Tests (351 pass)
- [ ] BLOCKED (user): one real paid booking per product to certify
- [x] Crystal: deposit checkout (FX-locked INR, card within limit / Wallet), one Option per paid reservation, no write retries
- [ ] BLOCKED (user): first real paid Crystal deposit to certify

# Roadmap — Trip intelligence end-to-end
- [x] Pipeline (constraints, confidence, freshness, risks, channels, 4 alternatives) wired into proposals
- [x] Decisions + learning + contracted inventory + recheck tables; hourly bounded recheck
- [x] Admin /admin/intelligence
- [x] WhatsApp/voice/chat transcript input (PDF/image/URL already supported)
- [ ] Contracted inventory merged into live proposal search
- [ ] Booked/failed/cancelled outcomes written from booking engine (currently read from bookings)
- [ ] Live Voice Concierge
- [ ] Proposal labels/confidence shown on customer trip planner
