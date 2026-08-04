# WorldwayLuxe → Worldway Travels Group — Enterprise Migration Checklist

Source: Worldway Luxury Journeys (worldwayluxe.lovable.app)
Target: this project (production foundation). Nothing existing is removed.

Scale of source: ~180 route files, ~75 lib domains, dedicated DB schema.
Migration runs module-by-module; each lands build-clean before the next.

## Legend
[x] present here  [ ] missing  [~] partial

## 1. Customer Portal
[~] /account (single page)  → [ ] trips, bookings, quotes, saved, travellers, documents, preferences, notifications
[x] /wallet  [x] /auth  [ ] onboarding  [ ] invitation/$token

## 2. AI Concierge
[x] /concierge (live proxy)  [ ] threads ($threadId), concierge bookings, notifications, profile, admin.concierge

## 3. Booking Engine
[x] flights, hotels, buses, activities, transfers, trip-builder
[ ] /book, /checkout/$bookingId, /pay, booking holds, booking tokens, pricing/markup engine

## 4. Admin Portal
[x] admin overview, crm, bookings, payments, api, users, agents, kyc, content, audit, settings, super
[ ] admin.concierge, admin.intelligence, admin.tour-categories, control-plane, observability

## 5. Supplier / Operator Portal
[ ] operator portal, operators index/$operator, supplier management, supplier sync jobs

## 6. CRM
[~] /admin/crm  [ ] crm360, lead scoring, campaigns, reporting

## 7. Memberships
[x] /membership  [ ] membership.request, tier entitlements, subscriptions

## 8. Payments
[~] wallet top-up (Razorpay/PayPal proxy)  [ ] checkout, payment intents, refunds, payouts, Wise

## 9. SEO suite (RankForge)
[ ] entire /seo/* + /rankforge/* suite, sitemaps, blog, guides, structured data

## 10. Analytics
[ ] GA integration, BI dashboards, traffic/visibility reporting

## 11. Trip Planner
[x] /trip-builder  [ ] saved plans, PDF export, plan email

## 12. Private Aviation
[~] /private-jets, /aircraft, /private-aviation/empty-legs
[ ] charter, compare, map, planner, routes/$pair, destinations, aircraft/$slug, my-charter, my-jet-bookings

## 13. Luxury Rail
[ ] /trains, /train-tours (+ canada, compare, ops), rail-europe

## 14. Cruises
[ ] full /cruises suite (lines, ships, sailings, collections, Crystal, Royal Caribbean, CruiseDirect)

## 15. Tours & Journeys
[ ] /tours, /journeys, /destinations, /experiences, TTC, tours marketplace

## 16. Villas / Yachts / Visa / Insurance
[ ] all four (currently dormant entries in PRODUCT_REGISTRY, no partner endpoint yet)

## 17. White-label / Multi-tenant
[ ] /p/$slug storefronts, tenant branding, white-label portal

## 18. Developer Platform
[ ] /developers, developer portal (keys, plans, usage, explorer, docs), API governance, gateway

## 19. Content & Trust
[x] about, contact (stores enquiries in contact_messages), help, trust, privacy, terms, cookies
[ ] blog, guides, unsubscribe

## Execution order (priority)
1. Customer Portal (schema + sub-routes)   [done]
2. Content & Trust pages                   [done]
3. Private Aviation expansion
4. Booking engine (book / checkout / pay)
5. Supplier & Operator portal
6. Rail + Cruises (needs partner endpoints)
7. Developer platform, white-label, SEO suite

## Constraints discovered
- Villas/Yachts/Visa/Insurance/Cruises/Rail have NO Partner API endpoint confirmed; they stay dormant
  until worldwayluxe exposes them. Recreating them as UI-only would ship fake inventory (rejected).
- Source project's SEO/RankForge suite is a separate SaaS product (~60 files + own schema);
  scheduled last and only on explicit request.
