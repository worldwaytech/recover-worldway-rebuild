# Final supplier privacy hardening — browser payloads, APIs, MCP

## Goal
Everything the browser, B2B partners, APIs and AI tools receive contains only Worldway labels and Worldway references. Real supplier/operator data stays server-side (Admin/Ops/audit). URLs, ship names, pricing and booking logic unchanged. Single exception: contractual Viator/Tripadvisor review attribution.

## Why this is bigger than the last pass
29 server-function modules send data to the browser. Many responses carry supplier IDs that booking needs later (hotel rate keys, activity product codes, flight result indexes, fare ticket IDs, hold references). Simply deleting them would break booking, so they must be swapped for Worldway references and swapped back on the server.

## Approach

### 1. Global output guard (automatic, covers future suppliers)
- One shared server middleware applied to every customer-facing server function. It runs the existing confidentiality filter on the result before it leaves the server:
  - supplier/operator names and brand labels become neutral Worldway labels
  - metadata fields (supplier, provider, source, sourceUrl, partnerName, brandLabel, endpoint, raw, routing, credentials…) are removed
  - third-party links become Worldway links; images use the /media proxy
- Admin/Ops functions are exempt only after a server-side Super Admin/Admin role check. The page someone is on does not grant the exemption.
- Every server function must be marked either "customer" (guarded) or "admin" (role-checked). A test fails if an unmarked function exists, so new suppliers are covered automatically.

### 2. Worldway references for booking-critical IDs
- New server-only reference store: `WW-…` reference → supplier, supplier ID and context, with an expiry. It is readable only by the server.
- At the browser boundary, supplier IDs in search/detail/hold responses are replaced by `WW-…` references. At the start of each booking/revalidation server function, references are swapped back to the real IDs before the unchanged supplier logic runs.
- Applies to hotels, activities, flights (incl. pre-purchased), buses, transfers, cabs, travel protection, tours, cruises and private aviation, for search, hold, book, status and cancel.

### 3. Page data bundled into the browser
- Operator names, brand labels, source URLs and supplier codes that are bundled into page code (journeys, guided tours, cruise content) are moved server-side or replaced with neutral labels.
- The brand filter keeps working through neutral Worldway style categories, not brand codes.

### 4. B2B, public API and MCP
- Partner feed replies, public endpoints and all MCP tools use the same filter and reference layer, and errors are passed through the filter too.

## Documented exceptions (per your instructions)
- Existing page addresses that already contain a supplier word or code (e.g. `/crystal-cruises/...`, `/ttc/<brand>/<slug>`, `/hotels/hbx`, voyage codes in addresses) stay as they are. Links to them therefore still contain those words.
- Real ship names stay.
- The contractual review attribution stays.

## Verification
- Leak tests:
  - every customer server function is guarded
  - fixture responses for each product contain no supplier terms, IDs or metadata
  - the reference round-trip restores the exact supplier IDs
  - the page-bundle scan finds no supplier terms
- A live check with Playwright: search, detail and hold on hotels, activities and flights, with browser network responses scanned for leaks. No real bookings or payments.
- Full test suite, type check and production build must pass.

## Technical details
- Middleware: `createMiddleware({ type: "function" }).server(...)` wraps `next()` and replaces `result` with `redactForExternal(result)` (extended). It is attached per function via a `customerFn`/`adminFn` helper, not globally, so admin views keep real data.
- Reference store: table `worldway_refs(ref text pk, supplier_key, supplier_ref jsonb, kind, expires_at, created_at)`. GRANT to service_role only, RLS enabled with no client policies, accessed via the admin client inside handlers. Refs expire after 24h (48h for holds).
- Encode/decode helpers live in `src/lib/confidentiality/refs.server.ts`. Booking functions call `resolveRef()` as their first step. Internal supplier code is untouched.
- Static test: parse every `createServerFn` in `src/lib/**/*.functions.ts` and assert that it goes through `customerFn` or `adminFn`.
- Risk: the booking flows depend on the reference swap, so each is regression-tested with recorded fixtures, and hold/book is re-verified in sandbox where the supplier allows it.
