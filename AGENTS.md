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
- Every external response layer (MCP tools, public/partner APIs) returns through src/lib/confidentiality/redact.ts (externalToolResult / redactForExternal), which derives supplier terms from the partner registry — so future suppliers are hidden automatically; regression tests in src/lib/confidentiality/__tests__.
