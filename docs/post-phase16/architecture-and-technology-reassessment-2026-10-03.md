# Worldway Post-Phase-16 Architecture & Technology Reassessment
Date: 2026-10-03
Repository: worldwaytech/recover-worldway-rebuild
Baseline: main after Post-Phase-16 security hardening
Commit: a63c3f44a9894d9aeaaa98e7abb4f3cdb5168042

## Executive conclusion
Phases 1–16 are treated as a locked foundation. This reassessment does not reopen those phases.

The current architecture already contains the critical deterministic travel-commerce primitives: chronological Trip Graph and timezone-aware feasibility, normalized canonical offers, ranking and Pareto optimization, package orchestration and audit, dynamic pricing, booking-readiness and payment/fulfilment controls, supplier capability registry, AI Model Router, AI Tool Fabric, deterministic authority, traveller memory/personalization, MCP boundary, and evidence-backed Phase-16 travel intelligence/network state.

The next architectural layer should therefore be an explicit Worldway AI Orchestrator above these primitives, not another parallel booking engine.

## 1. Current architecture: retained

### Deterministic commerce core
normalize -> Trip Graph -> rank -> optimize -> revalidate -> audit -> price -> booking readiness

The core remains the authority for availability, schedules, prices, capability, eligibility and booking state.

### AI foundation
The repository already has:
- provider-agnostic Model Router with health/fallback
- Tool Fabric with schemas, permissions, scopes, risk and audit
- deterministic authority boundaries
- supplier/web content safety filtering
- typed agent runtime with supervisor validation
- trace storage and telemetry
- MCP-to-Tool-Fabric bridge

Current runtime policy intentionally keeps autonomousBooking=false.

### Memory
Phase 13 provides consent-aware traveller memory and personalization. This becomes a context source for the future orchestrator, not a replacement for deterministic trip/booking state.

### Phase 16 intelligence network
Phase 16 adds canonical graph nodes/edges, intelligence observations and governed commerce-network requests. These tables are server-side state and were hardened in the post-Phase-16 audit.

## 2. Principal gaps identified

| Area | Current state | Post-Phase-16 requirement |
| --- | --- | --- |
| AI orchestration | Typed runtime foundation | Explicit multi-agent/task orchestrator |
| Agent coordination | Supervisor validates plans | Task graph, delegation, dependencies, budgets and termination |
| Travel knowledge | Phase-16 graph + existing intelligence | Unified retrieval/grounding layer over canonical Worldway knowledge |
| Traveller context | Memory exists | Unified trip + traveller + consent context envelope |
| Supplier intelligence | Static server catalogue + capability grants | Live certification/SLA/health evidence |
| External technology | Existing connectors + dormant integrations | Evidence-based integration gate |
| Autonomous commerce | Booking authority remains deterministic | Controlled future autonomy with explicit approval/policy gates |
| Observability | AI traces + audit | End-to-end agent/task/tool/economic trace |
| Public/MCP boundary | Tool Fabric bridge | Unified policy-aware orchestration boundary |

## 3. Supplier/integration reassessment

Repository-recorded supplier evidence remains the source of truth for implementation readiness. No supplier is promoted merely because an external vendor advertises a capability.

Current catalogue observations:
- Crystal: production booking/cancellation evidence recorded.
- UP17: production search evidence; booking not production-certified.
- AIR iQ: production search/price evidence; booking not production-certified.
- Viator Affiliate: production search/price; booking access not certified.
- Viator Merchant: sandbox lifecycle certified.
- G Adventures: UAT with certification gaps.
- TravelShop: full 8,345/8,345 catalogue sync and live availability/price evidence; paid production booking not certified.
- HBX Hotels/Transfers: UAT certification gaps.
- RateHawk: UAT, certification incomplete.
- TripJack Cabs: blocked by UAT 503.
- Private Aviation: production estimates/confirmation requests, no booking/payment API.
- Amadeus: deliberately disabled until a separate certification decision.
- TTC, SkyAccess and other incomplete integrations remain gated by evidence.

### Integration gate
Future suppliers must pass, in order:
1. Contract/API access verified.
2. Authentication and environment verified.
3. Search and normalization verified.
4. Availability/price consistency verified.
5. Booking/prebook lifecycle verified where applicable.
6. Cancellation/refund/modify evidence verified where applicable.
7. Failure/retry/idempotency behavior verified.
8. Supplier SLA/health telemetry available.
9. Supplier identity remains server-only.
10. Production certification evidence committed before promotion.

## 4. External technology landscape check

This is a capability comparison, not a vendor ranking.

### Travelgate
Travelgate currently documents HotelX Pull Buyers APIs for real-time search/quote/booking and ChannelX Push Buyers APIs for inventory distribution. Its published network material describes 1,000+ suppliers and buyers and connectivity spanning hotels, transfers and tours.

Implication for Worldway:
- Relevant as a connectivity expansion layer.
- Evaluate against Worldway's existing normalized supplier adapter layer.
- Integrate only if it materially improves coverage, economics, latency or operational resilience.

Sources:
- https://docs.travelgate.com/docs/apis/overview/
- https://travelgate.com/apis

### DerbySoft
DerbySoft currently describes connectivity services, property connectors and a travel-commerce platform spanning connectivity and content.

Implication for Worldway:
- Relevant primarily to accommodation connectivity/distribution.
- Evaluate overlap with HBX, RateHawk and the existing supplier registry before integration.
- Avoid duplicating a capability already owned by Worldway unless the external layer creates measurable network or operational leverage.

Source:
- https://www.derbysoft.com/

### Airwallex
Airwallex currently exposes APIs for payments and money movement, with server-side authentication, PaymentIntents and payout/payment APIs. Its documentation also provides sandbox support and date-based API versioning.

Implication for Worldway:
- Potentially relevant to international payment/settlement architecture.
- Evaluate against the existing Razorpay/PayPal/wallet orchestration and Worldway ledger model.
- No payment-provider replacement should occur without reconciliation, FX, refund, webhook and ledger certification.

Sources:
- https://www.airwallex.com/docs/developer-tools/api
- https://www.airwallex.com/docs/api/payments/payment_intents/create

### Spotnana
Spotnana currently documents open-platform integrations and APIs for travel content sources, including direct airline integrations.

Implication for Worldway:
- Relevant to corporate/managed travel and air-content connectivity.
- Evaluate only after mapping its APIs to the existing flight normalization, Trip Graph, ranking and booking architecture.

Source:
- https://www.spotnana.com/integrations/

### Other candidates
RateGain, Riskline, Navan, SAP Concur and Amadeus remain on the reassessment list. They should be evaluated in dedicated evidence packs against explicit Worldway capability gaps rather than added as feature-driven integrations.

## 5. Architectural decision

The post-Phase-16 sequence is:
1. Worldway AI Orchestrator
2. Travel Knowledge Layer
3. Traveller + Trip Memory
4. Specialist Agent Framework
5. Controlled Agentic Commerce

### Upgrade 1 — Worldway AI Orchestrator
Build an orchestration layer that:
- accepts a normalized travel/commercial objective
- creates a deterministic task graph
- delegates specialist work
- retrieves knowledge and traveller context
- invokes tools only through the Tool Fabric
- enforces budgets, permissions, deadlines and stop conditions
- sends all commerce mutations back through deterministic engines
- records an end-to-end trace
- returns an evidence-backed result

### Upgrade 2 — Travel Knowledge Layer
Unify:
- Phase-16 graph state
- supplier evidence
- destination intelligence
- product/catalogue knowledge
- policy and capability evidence
- operational learnings

### Upgrade 3 — Traveller + Trip Memory
Unify consented:
- traveller preferences
- trip history
- active journey state
- constraints
- decisions
- approved preferences

### Upgrade 4 — Specialist Agent Framework
Introduce bounded specialist responsibilities:
- Flight Intelligence
- Hotel Intelligence
- Experience Intelligence
- Luxury/Private Aviation
- Cruise + Land
- Destination Intelligence
- Supplier Operations
- Pricing/Revenue
- Booking/Fulfilment
- Risk/Trust

### Upgrade 5 — Controlled Agentic Commerce
Only after the orchestrator and knowledge/context layers are proven:
- quote
- hold
- book
- modify
- cancel
- refund

Each action remains governed by deterministic policy and explicit authorization.

## 6. Non-negotiable constraints
1. No second booking engine.
2. No AI-generated availability, price or schedule facts.
3. No supplier identities in customer-facing payloads.
4. No direct model access to privileged mutations.
5. No promotion of uncertified suppliers to production capability.
6. No autonomous payment or booking without a future explicit policy gate.
7. Every external fact used for a commerce decision must have provenance.
8. Every agent action must be traceable to task, tool, policy and result.
9. Phase 1–16 deterministic engines remain authoritative.
10. New capabilities must be additive and independently reversible.

## 7. Immediate implementation target

The next code implementation is the Worldway AI Orchestrator foundation.

It should introduce:
- OrchestrationRequest
- OrchestrationTask
- TaskDependency
- TaskBudget
- ExecutionPolicy
- OrchestrationContext
- OrchestrationResult
- deterministic task scheduler
- delegation interface for specialist agents
- Tool Fabric execution adapter
- trace correlation
- hard stop / timeout / max-step controls
- deterministic commerce handoff

The first implementation must be read-only/planning-first. It must not enable autonomous booking.

## 8. Exit criteria for Upgrade 1
Upgrade 1 is complete only when:
- orchestrator planning is deterministic under the same inputs
- task dependencies are enforced
- tool calls cannot bypass Tool Fabric
- budgets and step limits are enforced
- supplier/customer confidentiality remains intact
- commerce facts are sourced from deterministic engines
- failed tasks produce explicit recovery states
- full orchestration traces are persisted without secrets/PII
- existing Phase 1–16 test suites remain green
- production build remains green
