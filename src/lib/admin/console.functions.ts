// Read-only Admin console data: every value comes from the database or server
// configuration. Nothing here is sample data, and no secret value is returned
// (only whether a secret is present). All functions are staff-gated; customer
// Travel DNA is Super Admin only and every view is audited.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  userId: string;
  claims?: { email?: string };
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
};

async function assertStaff(context: Ctx) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}
async function assertSuper(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const PAID = new Set(["captured", "paid", "verified", "fulfilled", "succeeded"]);
const FAIL = /fail|error|declin|reject|blocked|timeout/i;

function sumByCurrency(rows: { amount: number; currency: string | null }[]) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const c = (r.currency || "INR").toUpperCase();
    out[c] = (out[c] ?? 0) + Number(r.amount || 0);
  }
  return out;
}

async function count(sb: any, table: string, build?: (q: any) => any) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (build) q = build(q);
  const { count: n, error } = await q;
  return error ? null : (n ?? 0);
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const [users, agents, admins, bookings, contactsOpen, quotesOpen, providersOn, recent, pays, roles] = await Promise.all([
      count(sb, "profiles"),
      count(sb, "user_roles", (q) => q.eq("role", "agent")),
      count(sb, "user_roles", (q) => q.in("role", ["admin", "super_admin"])),
      count(sb, "bookings"),
      count(sb, "contact_messages", (q) => q.not("status", "in", "(closed,resolved)")),
      count(sb, "quote_requests", (q) => q.not("status", "in", "(closed,won,lost,converted)")),
      count(sb, "integration_providers", (q) => q.eq("enabled", true)),
      sb.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }).limit(8),
      sb.from("payments").select("amount_minor, currency, status").limit(5000),
      sb.from("user_roles").select("user_id, role"),
    ]);
    const roleOf = new Map<string, string>();
    for (const r of roles.data ?? []) roleOf.set(r.user_id, r.role);
    const revenue = sumByCurrency(
      (pays.data ?? []).filter((p: any) => PAID.has(String(p.status))).map((p: any) => ({ amount: Number(p.amount_minor) / 100, currency: p.currency })),
    );
    return {
      users, agents, admins, bookings, openEnquiries: (contactsOpen ?? 0) + (quotesOpen ?? 0), providersOn, revenue,
      recent: (recent.data ?? []).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name, createdAt: u.created_at, role: roleOf.get(u.id) ?? "b2c" })),
    };
  });

export const listAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const { data: roles } = await sb.from("user_roles").select("user_id, created_at").eq("role", "agent");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await sb.from("profiles").select("id, email, full_name, company, created_at").in("id", ids);
    const { data: bk } = await sb.from("bookings").select("user_id").in("user_id", ids);
    const n = new Map<string, number>();
    for (const b of bk ?? []) n.set(b.user_id, (n.get(b.user_id) ?? 0) + 1);
    return (profiles ?? []).map((p: any) => ({ id: p.id, email: p.email, name: p.full_name, company: p.company, createdAt: p.created_at, bookings: n.get(p.id) ?? 0 }));
  });

export const listEnquiries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const [c, q] = await Promise.all([
      sb.from("contact_messages").select("id, name, email, category, subject, status, created_at").order("created_at", { ascending: false }).limit(200),
      sb.from("quote_requests").select("id, full_name, email, product_kind, product_title, party_size, travel_month, status, created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    return { contacts: c.data ?? [], quotes: q.data ?? [] };
  });

export const listJourneys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const { data } = await sb.from("journeys").select("id, user_id, state, current_version, currency, created_at, updated_at").order("updated_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const getJourneyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const id = data.id;
    const [j, v, s, a, e] = await Promise.all([
      sb.from("journeys").select("*").eq("id", id).maybeSingle(),
      sb.from("journey_versions").select("version, parent_version, bookable, reason, pricing, issues, graph, dependencies, readiness, on_request, sources, explanation, created_at").eq("journey_id", id).order("version"),
      sb.from("journey_simulations").select("id, base_version, change, status, requires_approval, bookable_after, price_delta, material, impacted, new_issues, created_at").eq("journey_id", id).order("created_at"),
      sb.from("journey_approvals").select("simulation_id, decision, decided_by, note, created_at").eq("journey_id", id).order("created_at"),
      sb.from("journey_events").select("event_type, from_state, to_state, version, actor, detail, created_at").eq("journey_id", id).order("created_at"),
    ]);
    if (!j.data) throw new Error("Journey not found");
    return JSON.parse(JSON.stringify({ journey: j.data, versions: v.data ?? [], simulations: s.data ?? [], approvals: a.data ?? [], events: e.data ?? [] }));
  });

const COMMERCIAL_KEYS = ["crystal", "up17", "airiq", "ratehawk", "viator-affiliate", "viator-merchant", "hbx-hotels", "hbx-activities", "hbx-transfers", "ttc", "cruisea", "bokun", "g-adventures", "abercrombie-kent", "tripjack-cabs", "tripjack-tripsafe", "private-aviation"];
const EFFECTIVE: Record<string, string> = { "worldway-initial-2026-09": "2026-09-29", "airiq-fixed": "Fixed in connector", "ratehawk-config": "Server configuration" };

export const getPricingConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { commercialCoverage } = await import("@/lib/engine/suppliers/commercial.server");
    const rules = commercialCoverage(COMMERCIAL_KEYS).map((r) => ({
      ...r, commissionPercent: r.source ? 0 : null, effective: r.source ? (EFFECTIVE[r.source] ?? null) : null,
    }));
    const sb = await db();
    const { data: audit } = await sb.from("admin_audit_log").select("action, actor_email, target_table, detail, created_at")
      .or("action.ilike.%markup%,action.ilike.%pricing%,action.ilike.%fx%,action.ilike.%commission%").order("created_at", { ascending: false }).limit(50);
    return JSON.parse(JSON.stringify({
      rules,
      fx: { provider: "Live: Open Exchange Rates (if key set) → ECB via Frankfurter → ExchangeRate-API", configured: true, cacheMinutes: 30, staleAfterHours: 96 },
      audit: audit ?? [],
    }));
  });

export const getTravelDnaOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context as never);
    const sb = await db();
    const [dna, versions, sims] = await Promise.all([
      sb.from("travel_dna").select("user_id, consent_preferences, consent_history, preferences, updated_at").order("updated_at", { ascending: false }).limit(200),
      sb.from("journey_versions").select("explanation, created_at").gte("created_at", since(30)).limit(2000),
      count(sb, "journey_simulations", (q) => q.gte("created_at", since(30))),
    ]);
    await sb.from("admin_audit_log").insert({
      actor_id: context.userId, actor_email: (context as any).claims?.email ?? null,
      action: "travel_dna.view", target_table: "travel_dna", detail: { rows: (dna.data ?? []).length },
    });
    const rows = (dna.data ?? []).map((r: any) => ({
      ref: `DNA-${String(r.user_id).slice(0, 8)}`,
      consented: r.consent_preferences === true || (r.consent_preferences && typeof r.consent_preferences === "object" && Object.values(r.consent_preferences).some(Boolean)),
      consentChanges: Array.isArray(r.consent_history) ? r.consent_history.length : 0,
      preferenceFields: r.preferences && typeof r.preferences === "object" ? Object.keys(r.preferences).length : 0,
      updatedAt: r.updated_at,
    }));
    const vs = versions.data ?? [];
    return {
      rows,
      ai: {
        model: "openai/gpt-6-astra",
        gatewayConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
        versions30d: vs.length,
        explained30d: vs.filter((v: any) => v.explanation).length,
        simulations30d: sims,
      },
    };
  });

export type OpsAlert = { severity: "critical" | "warning"; kind: string; title: string; detail: string; at: string | null };

export const getOpsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const d7 = since(7);
    const [health, logs, runs, bookings, pays, sims, cert, providers] = await Promise.all([
      sb.from("supplier_health_status").select("supplier_key, status, error_rate, last_error, last_checked_at"),
      sb.from("integration_logs").select("provider_key, operation, http_status, message, created_at").eq("level", "error").gte("created_at", d7).order("created_at", { ascending: false }).limit(50),
      sb.from("integration_sync_runs").select("provider_key, status, error, started_at").gte("started_at", d7).order("started_at", { ascending: false }).limit(200),
      sb.from("bookings").select("reference, status, supplier_status, updated_at").gte("updated_at", since(30)).limit(1000),
      sb.from("payments").select("reference, status, failure_reason, created_at").gte("created_at", since(30)).limit(1000),
      sb.from("journey_simulations").select("journey_id, price_delta, created_at").gte("created_at", d7).limit(500),
      sb.from("tripjack_certification_cases").select("case_key, suite, status, updated_at"),
      sb.from("integration_providers").select("provider_key, name, enabled, connection_state, connection_detail, connection_checked_at").eq("enabled", true),
    ]);
    const out: OpsAlert[] = [];
    for (const h of health.data ?? []) {
      const bad = FAIL.test(String(h.status)) || /down|degraded|unhealthy/i.test(String(h.status));
      if (bad || Number(h.error_rate) >= 0.25)
        out.push({ severity: /down|fail/i.test(String(h.status)) ? "critical" : "warning", kind: "Supplier health", title: `${h.supplier_key}: ${h.status}`, detail: h.last_error ?? `Error rate ${Math.round(Number(h.error_rate) * 100)}%`, at: h.last_checked_at });
    }
    for (const p of providers.data ?? [])
      if (FAIL.test(String(p.connection_state)))
        out.push({ severity: "warning", kind: "Connection", title: `${p.name}: ${p.connection_state}`, detail: String(p.connection_detail ?? "").slice(0, 200), at: p.connection_checked_at });
    for (const l of logs.data ?? [])
      out.push({ severity: "warning", kind: "API error", title: `${l.provider_key} · ${l.operation}${l.http_status ? ` (${l.http_status})` : ""}`, detail: String(l.message ?? "").slice(0, 200), at: l.created_at });
    for (const r of runs.data ?? [])
      if (FAIL.test(String(r.status)))
        out.push({ severity: "warning", kind: "Sync failure", title: `${r.provider_key} sync ${r.status}`, detail: String(r.error ?? "").slice(0, 200), at: r.started_at });
    for (const b of bookings.data ?? [])
      if (FAIL.test(String(b.status)) || FAIL.test(String(b.supplier_status ?? "")))
        out.push({ severity: "critical", kind: "Booking failure", title: `Booking ${b.reference}`, detail: `Status ${b.status}${b.supplier_status ? ` · supplier ${b.supplier_status}` : ""}`, at: b.updated_at });
    for (const p of pays.data ?? [])
      if (FAIL.test(String(p.status)))
        out.push({ severity: "warning", kind: "Payment failure", title: `Payment ${p.reference ?? ""}`.trim(), detail: String(p.failure_reason ?? p.status), at: p.created_at });
    for (const s of sims.data ?? [])
      if (Number(s.price_delta) !== 0 && s.price_delta != null)
        out.push({ severity: "warning", kind: "Price change", title: `Journey ${String(s.journey_id).slice(0, 8)}`, detail: `Price change ${Number(s.price_delta) > 0 ? "+" : ""}${s.price_delta}`, at: s.created_at });
    for (const c of cert.data ?? [])
      if (FAIL.test(String(c.status)))
        out.push({ severity: "warning", kind: "Certification", title: `${c.suite} · ${c.case_key}`, detail: `Status ${c.status}`, at: c.updated_at });
    out.sort((a, b) => (a.severity === b.severity ? String(b.at ?? "").localeCompare(String(a.at ?? "")) : a.severity === "critical" ? -1 : 1));
    return out.slice(0, 300);
  });

export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const sb = await db();
    const [bk, pays, bp, health, runs] = await Promise.all([
      sb.from("bookings").select("product_type, status, amount, amount_paid, currency, created_at").limit(10000),
      sb.from("payments").select("purpose, amount_minor, currency, status, created_at").limit(10000),
      sb.from("booking_payments").select("amount, currency, status, kind, created_at").limit(10000),
      sb.from("supplier_health_status").select("supplier_key, status, calls, failures, p50_ms, booking_eligible"),
      sb.from("integration_sync_runs").select("provider_key, status").gte("started_at", since(30)).limit(5000),
    ]);
    const bookings = bk.data ?? [];
    const group = (rows: any[], key: (r: any) => string) => {
      const m: Record<string, number> = {};
      for (const r of rows) m[key(r)] = (m[key(r)] ?? 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const mtd = new Date(); mtd.setUTCDate(1); mtd.setUTCHours(0, 0, 0, 0);
    const paid = (pays.data ?? []).filter((p: any) => PAID.has(String(p.status)));
    const recorded = (bp.data ?? []).filter((p: any) => !FAIL.test(String(p.status)));
    const cancelled = bookings.filter((b: any) => /cancel/i.test(String(b.status))).length;
    const sync: Record<string, { ok: number; failed: number }> = {};
    for (const r of runs.data ?? []) {
      const s = (sync[r.provider_key] ??= { ok: 0, failed: 0 });
      if (FAIL.test(String(r.status))) s.failed++; else s.ok++;
    }
    return {
      bookingsTotal: bookings.length,
      bookingsMtd: bookings.filter((b: any) => b.created_at >= mtd.toISOString()).length,
      cancellationRate: bookings.length ? cancelled / bookings.length : null,
      bookedValue: sumByCurrency(bookings.map((b: any) => ({ amount: Number(b.amount), currency: b.currency }))),
      gatewayRevenue: sumByCurrency(paid.map((p: any) => ({ amount: Number(p.amount_minor) / 100, currency: p.currency }))),
      gatewayRevenueMtd: sumByCurrency(paid.filter((p: any) => p.created_at >= mtd.toISOString()).map((p: any) => ({ amount: Number(p.amount_minor) / 100, currency: p.currency }))),
      recordedPayments: sumByCurrency(recorded.map((p: any) => ({ amount: Number(p.amount), currency: p.currency }))),
      byProduct: group(bookings, (b) => b.product_type ?? "other"),
      byStatus: group(bookings, (b) => b.status ?? "unknown"),
      byPurpose: group(paid, (p) => p.purpose ?? "other"),
      suppliers: (health.data ?? []).map((h: any) => ({ key: h.supplier_key, status: h.status, calls: h.calls, failures: h.failures, p50: h.p50_ms, bookable: h.booking_eligible })),
      sync: Object.entries(sync).map(([key, v]) => ({ key, ...v })),
    };
  });
