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

- Journey engine core lives in src/lib/engine as pure, supplier-agnostic modules; suppliers plug in only via adapters normalising to engine/types.ts — keeps supplier logic out of the core.
- Private aviation supplier (Villiers MCP + RSS) lives in src/lib/aviation/ (villiers.server.ts client, private-aviation.functions.ts); requests persist in private_aviation_requests with supplier columns never returned to customers — keeps partner identity/credentials server-side.
- Villiers request_jet_confirmation is sent with the Worldway aviation desk email (not the customer's) so partner emails never reach customers; never auto-retried except after an explicit "estimate required" rejection.
- Private aviation payments use Razorpay purpose "private_aviation"; the amount always comes from the desk-entered confirmed quote on private_aviation_requests (checkQuotePayable in src/lib/aviation/quote.ts), finalised idempotently by checkout or webhook — the partner has no payment API.
- Airport master is a generated OurAirports snapshot in src/lib/aviation/airports.data.server.ts, searched server-side only — keeps ~600KB out of the browser bundle.
- MCP search_flights routes through src/lib/engine/orchestrator.ts to flight adapters in src/lib/flights/flight-adapters.server.ts (UP17, AIR iQ) by capability/health, never the WorldwayLuxe partner API — keeps MCP working without a partner key.
- Every external response layer (MCP tools, public/partner APIs) returns through src/lib/confidentiality/redact.ts (externalToolResult / redactForExternal), which derives supplier terms from the partner registry — so future suppliers are hidden automatically; regression tests in src/lib/confidentiality/__tests__. Third-party images on customer pages go through mediaUrl() (src/lib/media.ts) → /media/$token proxy, enforced by the customer-surfaces test.
- Every server function passes through the global supplierPrivacyMiddleware (src/lib/confidentiality/privacy-middleware.ts → guard.server.ts): non-staff results get supplier fields sealed as wwr_ references (restored on input), names reworded, third-party links/images via /go and /media/s. — keeps suppliers out of all browser payloads without touching booking logic.
- Journey marketing content is served by src/lib/all-journeys.functions.ts, never imported by routes — keeps operator content out of the browser bundle.
- Supplier capabilities live in src/lib/engine/suppliers/catalog.server.ts as evidence-backed grants (capability × environment × certified); only certified production availability+price+book enter Booking Readiness — adding a supplier never touches the core pipeline (src/lib/engine/package.ts).
- Journey intelligence (Travel DNA, dependencies, what-if, disruption, sequencing, explanation guard) lives in src/lib/engine/intelligence as pure modules over the package pipeline; AI text must pass verifyNarrative and every change commits only via commitChange approval — keeps deterministic services authoritative.
- Journey persistence: journeys + append-only journey_versions/approvals/events + journey_simulations, written only via JourneyService (src/lib/engine/intelligence/store.ts) after an RLS access check; rollback is a simulated, approval-gated new version — full history is never rewritten.
- AI layer lives in src/lib/ai (Lovable AI Gateway, openai/gpt-6-astra, Responses, server-only): AI only extracts intent/requirements and phrases explanations; toRequirements/planEdits post-process deterministically, edits go through JourneyService.simulate, and narratives must pass verifyNarrative or fall back to engine text.
- Live package assembly: src/lib/engine/suppliers/live-search.server.ts maps existing adapters to CanonicalOffer (airport time zones from airport-tz.data.server.ts, flight supplier via server-only flightOfferSupplier map) and assembly.server.ts builds proposals from actual arrival dates; unscheduled/unavailable items are saved as on_request, never invented.

- Offers are revalidated live (src/lib/engine/suppliers/revalidate.server.ts) after ranking and before pricing/readiness; components are classified LIVE/AVAILABLE/ON_REQUEST/UNAVAILABLE/BOOKABLE only by src/lib/engine/classify.ts — keeps stale fares and uncertified suppliers out of booking.
- Package FX comes only from Open Exchange Rates (src/lib/engine/suppliers/fx.server.ts, OPEN_EXCHANGE_RATES_APP_ID, 1h cache, >6h stale fails); Worldway markups live in commercial.server.ts with price basis — keeps pricing auditable and never AI/0%-derived.
- Private jet marketplace data (src/lib/aviation/jet-routes.data.ts from OurAirports, aircraft-catalogue.data.ts from cited Wikipedia/Commons) is client-safe and price-free; prices are live partner estimates only (Villiers → SkyAccess read-only MCP failover in getJetEstimate) and the empty rate-sheet.server.ts is the only home for future indicative rates — keeps indicative and live pricing separate.
- Admin console reads live through src/lib/admin/console.functions.ts (staff-gated via is_staff; Travel DNA Super Admin only and audited) — no browser sample data in admin pages.
- Concierge answers via Worldway-AetherCore (Azure AI Foundry) in src/lib/ai/aethercore.server.ts using Worker-safe REST + Azure service-principal env vars — the Azure JS SDK/DefaultAzureCredential rely on Node-only auth libraries that don't run on the edge.
- Tour marketplace supplier (TravelShop Booking) lives in src/lib/travelshop/: resumable paginated sync into travelshop_tours (dedupe on external_id), customer DTOs only via catalogue.server.ts, supplier booking write gated by TRAVELSHOP_BOOKING_ENABLED — Bókun kept as history only, its sync hook disabled unless BOKUN_MARKETPLACE_ENABLED=true.
- Tour marketplace discovery (featured, best-selling, trending, Region→Country→City, country guides) is computed from travelshop_tours via server-only RPCs travelshop_explore / travelshop_catalogue_totals and catalogue.server.ts — guides use catalogue facts only, never written/AI content.
