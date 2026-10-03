# Post-Phase-16 Technology & Supplier Reassessment
Date: 2026-10-03

## Decision principle

This document is an evidence gate, not a vendor ranking.

Worldway's completed architecture remains authoritative. External technologies are admitted only when they provide a distinct capability, measurable coverage/economic benefit, and pass the same supplier certification discipline used by the existing stack.

## Candidate decisions

| Candidate | Domain | Current disposition | Architectural role |
|---|---|---|---|
| Travelgate | Hotel connectivity | Integrate candidate | Multi-supplier hotel/transfer/tour connectivity |
| DerbySoft | Hotel distribution | Strategic evaluate | Direct hotel connectivity and corporate hotel workflows |
| Airwallex | Payments | Strategic evaluate | Global payments, multi-currency and marketplace settlement |
| Riskline | Travel risk | Integrate candidate | Risk intelligence into Knowledge Layer and trip context |
| Amadeus | Air content | Strategic evaluate | Supplemental flight/content source after coverage and commercial audit |
| RateGain | Hotel connectivity | Strategic evaluate | Additional hotel distribution source |
| Spotnana | Corporate travel | Watchlist | Enterprise managed-travel interoperability |
| Navan | Corporate travel | Watchlist | Corporate direct-connect ecosystem monitoring |
| SAP Concur | Corporate travel | Watchlist | Enterprise travel/expense interoperability |

## Existing supplier certification priorities

- TravelShop: complete partner prerequisites and one paid production booking before promotion.
- RateHawk: remain UAT until search, price, prebook, production booking, cancellation/refund and failure evidence are complete.
- G Adventures: remain UAT until supplier write access and booking/cancellation evidence are available.
- HBX Hotels: remain UAT until mTLS and complete booking lifecycle evidence are available.
- HBX Transfers: remain UAT until booking lifecycle and failure/retry evidence are complete.
- Viator Affiliate: search/availability/price are evidenced, but affiliate booking entitlement and paid production booking remain uncertified.
- UP17: production search/availability/price are evidenced; production booking, cancellation/modification and idempotency evidence remain required.
- AirIQ: production search is evidenced; production booking/voucher/status and failure/retry evidence remain required.
- TripJack Cabs: blocked pending stable upstream location search and subsequent booking lifecycle evidence.
- Private Aviation: maintain enquiry/estimate scope until a real booking/payment API is certified.
- SkyAccess: do not expose customer pricing until supplier approval, live-data validation and departure-time correctness are verified.
- Amadeus: remain disabled/deferred pending coverage, economics, API access and production certification.

## Technology-specific evidence

Travelgate documents HotelX Pull Buyers API support for real-time search, quote, booking and reservation management, plus standardized FastX content identifiers. This maps to Worldway's normalized multi-supplier inventory and supplier-adapter architecture. citeturn0search0turn0search1turn0search14

DerbySoft documents direct hotel connectivity, structured content, real-time ARI and booking updates, and corporate hotel workflows. Its role should therefore be evaluated as direct hotel connectivity/distribution rather than a replacement for Worldway orchestration. citeturn1search1turn1search0

Airwallex provides payment, multi-currency, payout and payments-for-platform APIs, including sandbox testing and server-side authentication. Adoption must remain behind Worldway payment orchestration and approval controls. citeturn0search3turn0search18

Riskline exposes destination risk summaries, TripReady data and real-time travel alerts. This is a distinct intelligence capability suitable for the Travel Knowledge Layer rather than booking authority. citeturn2search3turn2search4turn2search7

Amadeus provides Self-Service and Enterprise API paths and covers flight, hotel, destination, car and transfer categories. It remains a supplemental content/connectivity candidate until coverage, economics and production certification are tested. citeturn2search0turn2search2

RateGain Smart Distribution provides hotel destination search, property/product retrieval, availability, reservation and cancellation capabilities. Evaluate it where its portfolio or economics materially complement existing hotel supply. citeturn1search11turn1search13

Spotnana exposes an open integration model for travel content sources and direct airline integrations. It remains a corporate-travel watchlist candidate pending a concrete interoperability requirement. citeturn0search6

Navan's current direct-connect work is focused on corporate hotel distribution and real-time hotel booking/content. Monitor for a concrete B2B interoperability requirement rather than introducing duplicate booking infrastructure. citeturn2search8

## Engineering gate

No candidate in this document becomes production-active merely because it appears here.

Promotion requires:
1. commercial/API access
2. credentials/environment validation
3. normalized search evidence
4. availability/price evidence
5. prebook/hold where applicable
6. production booking evidence where applicable
7. cancellation/refund/modify evidence
8. retry/idempotency/failure evidence
9. SLA/health telemetry
10. server-only supplier identity handling
11. security/privacy review
12. production certification record

The existing supplier catalog remains the runtime authority for actual supplier capability.

## Repository implementation

This change adds:
- a technology reassessment registry
- an evidence-driven supplier certification plan
- deterministic tests preventing reassessment records from being mistaken for certification

The next implementation work should execute against the certification plan and specific integration candidates whose API/commercial access is verified.
