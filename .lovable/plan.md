This is a large build. To match worldwayluxe.com's portal model correctly (and safely — role-based access needs a real backend, not localStorage), I'll do it in phased milestones. You already have empty scaffolds for `/admin`, `/agent`, `/b2b`, `/b2c` — I'll harden them with real auth + RLS and expand feature parity with the main project.

## Prerequisites

1. **Enable Lovable Cloud** (creates a managed database + auth). Required for roles, RLS, sessions. Blocking step — I'll call `supabase--enable` first.
2. Configure Google sign-in (via `supabase--configure_social_auth`) + email/password.

## Milestone 1 — Identity & Roles (foundation)

- `profiles` table: `id, email, full_name, avatar_url, company, phone` (auto-created via trigger on `auth.users` insert).
- `app_role` enum: `super_admin, admin, ops, api_partner, white_label, b2b_manager, b2b_agent, b2c`.
- `user_roles` table (separate table, per security rules) with `has_role(_user_id, _role)` SECURITY DEFINER function.
- RLS on every table; owner-scoped policies + `has_role` gates.
- Integration-managed `_authenticated/route.tsx` gate + role-gated sub-layouts (`_authenticated/_super`, `_authenticated/_admin`, `_authenticated/_partner`, `_authenticated/_b2b`).
- Real `/auth` page: email/password + Google, redirects preserved.
- First-signup bootstrap: first user or seeded email = `super_admin`.

## Milestone 2 — Super Admin

Route: `/admin/super`. Tabs: Workspaces, Users, Roles, Feature Flags, Integrations, Audit Log, Kill Switches, System Health. Server functions for role grants (guarded by `has_role('super_admin')`).

## Milestone 3 — Admin

Route: `/admin`. Tabs: CRM (leads, contacts), Bookings, Payments, KYC review, Content, Agents, API management, Settings. Reuses existing UI, wires it to Cloud tables (`bookings`, `payments`, `leads`, `kyc_documents`, `agents`, `api_keys`, `webhooks`, `audit_log`).

## Milestone 4 — API Partner Portal

Route: `/partner/api`. Self-service API key management (mint/rotate/revoke), scope selection, request logs, webhook subscriptions, docs, usage graphs, rate limits. Keys are hashed at rest; only shown once at creation.

## Milestone 5 — White-Label Partner Portal

Route: `/partner/white-label`. Tenant brand config (logo, colors, domain), commission rates, storefront preview, embed snippets, per-tenant catalogue filters, revenue share ledger.

## Milestone 6 — B2B Portal

Route: `/b2b`. Company setup, team members + roles within org, corporate wallet, per-traveler policies, expense reports, booking approvals workflow, negotiated rates, travel-manager dashboard.

## Milestone 7 — B2C Portal

Route: `/b2c` (public + auth). Consumer account, trips, wallet, loyalty tier, saved travelers, referrals, membership upgrades, notification prefs.

## Milestone 8 — Cross-cutting

Audit log for every privileged action, notifications (in-app + email), search across bookings/customers/agents, exports (CSV), role-gated navigation in `SiteHeader`.

## Technical Notes

- All roles stored in `user_roles` (never on `profiles`) — privilege escalation defense.
- Every table gets `GRANT` + RLS + policies in the same migration.
- Server functions use `requireSupabaseAuth`; privileged ones verify role via `has_role` RPC before loading `supabaseAdmin`.
- No hardcoded admin emails in client code.
- Existing `/admin.*` UI routes stay — I re-point their data reads to the new server fns instead of the localStorage `admin-store.ts`.
- Existing 15-product Partner Framework is untouched; API Partner Portal manages access **to** those endpoints.

## What I need from you

Given the size, please confirm:

1. **Green-light Lovable Cloud** (I'll enable it as the first step — introduces per-request DB usage). Reply "yes cloud" or similar.
2. **First super-admin email** — the address that gets `super_admin` on first sign-in (yours?).
3. **Milestone order** — go straight through 1→8, or start with 1+2 (Identity + Super Admin) and pause for review before 3?
4. **Portal path prefixes** — keep `/admin`, `/partner/api`, `/partner/white-label`, `/b2b`, `/b2c` (proposed), or match main project's paths exactly?

Once you confirm, I'll execute Milestone 1 in the next turn.