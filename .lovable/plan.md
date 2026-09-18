# Universal API Management & Product Sync Center — Production Completion

## Goal

Complete the existing provider-agnostic integration layer without replacing verified supplier clients or inventing unsupported APIs. Production status will mean that privileged operations are server-authoritative, supplier provenance is explicit, unsupported providers remain disabled, synchronization is recoverable and auditable, and the project passes security, database, authenticated-flow, test, and production-build validation.

## Phase 1 — Close critical security findings

- Prevent customers from creating arbitrary confirmed bookings or deleting booking history.
- Replace the catalogue demo-wallet booking path with a server-authoritative request/payment flow; no confirmed booking will be created from browser-calculated fare or browser storage.
- Make staff payment recording atomic and idempotent, including booking totals, installment status, event, document, and notification outcomes.
- Replace browser-only user deletion and role mutation with authenticated Super Admin functions; preserve roles in `user_roles` and create durable audit records.
- Remove the permanent bootstrap-admin email rule after preserving the existing administrator assignment.
- Remove or clearly disable production-facing browser-only Admin/API/KYC actions; real booking, payment, user, role, provider, log, and audit screens will use backend data.

## Phase 2 — Harden the database and access controls

- Add missing provider-ledger foreign keys, actor references where safe, lookup indexes, and product provenance constraints.
- Add missing user references and staff support policies in booking-related and Cruisea tables without weakening customer ownership.
- Revoke customer booking deletion and unsafe direct inserts; introduce safe status-transition and payment-recording functions.
- Tighten provider/configuration grants so ordinary authenticated users cannot mutate integration configuration even if a future policy regresses.
- Keep service access and RLS aligned; every schema change will include matching grants and policies.
- Unify privileged actions into a durable audit model while retaining immutable supplier/request logs needed for certification.

## Phase 3 — Finish the Universal Provider/Product Ledger

- Fix the three server-function TypeScript serialization/inference errors and regenerate the route types.
- Seed only documented provider definitions. Prospective or unverified providers stay `DISABLED / NOT CONNECTED` and cannot report live health.
- Complete configuration-driven REST/JSON suppliers: base URL, documented endpoints, supported authentication modes, secret-name references, field mapping, record paths, dedupe keys, pagination, retry/backoff, rate limits, timeouts, conflict policy, and full/incremental strategy.
- Validate provider URLs and paths, prevent private-network/credential exfiltration, redact secrets/PII from logs, and limit returned API data to safe serializable JSON.
- Preserve bespoke adapters for Crystal, TTC content, HBX, Cruisea, A&K content, G Adventures, Viator, UP17, and TripJack; generic configuration will not override supplier-specific safety rules.
- Implement recoverable sync runs, cursor persistence, per-product sync, stale/conflict states, failure isolation, replay-safe idempotency, and global/provider kill switches.

## Phase 4 — Webhooks, schedules, health, and recovery

- Require a configured provider-specific signing secret and documented signature scheme before enabling a webhook; reject unknown/unsigned providers and malformed payloads before persistence or processing.
- Add replay protection, bounded payload validation, processing state, retries, and durable error details without storing credentials or sensitive passenger/payment data.
- Version-control the automatic sync schedule through the protected public sync endpoint; due-provider logic remains authoritative and disabled providers are skipped.
- Surface truthful Test Connection and API Health states from real probes only, with last checked time and actionable failure detail.

## Phase 5 — Connect every applicable product surface

- Build one reusable staff-only provenance panel/table treatment showing Supplier, API Source, External ID, Sync Status, Last Sync, `API DATA`, and `SYNC NOW`.
- Attach ledger records to existing Crystal, TTC, HBX, Cruisea, A&K/All Journeys, G Adventures, Viator, UP17, TripJack, and other catalogue records that have a verifiable provider/external identifier.
- Add the same fields and actions to central product lists and relevant Admin product screens. Customer-facing pages retain their current booking/search experience and will not expose privileged raw API data or sync controls.
- Records with no external API remain labelled internal/content/manual with honest provenance rather than being presented as synchronized supplier inventory.

## Phase 6 — Verification and release gate

- Run targeted unit and integration tests for roles, booking creation/deletion, payment idempotency, webhook signatures/replays, generic provider mapping/pagination/retries, conflict handling, and per-product sync.
- Run the database linter and security scanner; resolve new and applicable existing findings.
- Test authenticated Admin and Super Admin workflows, provider health/sync operations, and representative product provenance on desktop and mobile.
- Validate each supplier against its real configured mode: live, test/UAT, imported content, native inventory, prospective, or entitlement-blocked.
- Require a clean typecheck, automated tests, preview runtime, and production build before completion.

## Non-negotiable safeguards

- No invented endpoints, credentials, inventory, bookings, payments, health states, or supplier capabilities.
- No secret values in the browser, database configuration rows, logs, API-data dialogs, or source control.
- No destructive migration that removes production history; cancellations and deactivations preserve audit evidence.
- Existing verified supplier clients and customer flows remain operational unless an audited security issue requires fail-closed behavior.