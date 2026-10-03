// Super Admin management of Travel Commerce API partners (tenants, members, keys).
// Plaintext keys are returned exactly once at creation and never stored. Every change is audited.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function superAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (data !== true) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const audit = (action: string, detail: Record<string, unknown>) =>
    db.from("admin_audit_log").insert({ actor_id: context.userId, actor_email: context.claims?.email ?? null, action, target_table: "partner_tenants", detail });
  return { db, audit };
}

const SCOPE = z.enum([
  "flights.search", "tours.read", "tours.quote", "trips.plan",
  "catalog.read", "pricing.quote", "booking.read", "booking.write",
  "payment.write", "wallet.read", "wallet.reserve",
]);
const API_PRODUCT = z.enum(["flights", "hotels", "transfers", "activities", "tours", "cruises", "rail", "private_aviation", "concierge"]);
const API_ACCESS_MODE = z.enum(["single_product", "multi_product", "full_catalogue"]);

export const listPartnerTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await superAdmin(context);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [t, k, m, u] = await Promise.all([
      db.from("partner_tenants").select("id, name, kind, status, rate_limit_per_minute, created_at").order("created_at", { ascending: false }),
      db.from("partner_api_keys").select("id, tenant_id, label, key_prefix, scopes, api_products, api_access_mode, expires_at, revoked_at, last_used_at, created_at").order("created_at", { ascending: false }),
      db.from("partner_members").select("id, tenant_id, user_id, role"),
      db.from("partner_api_usage").select("tenant_id, status").gte("created_at", since).limit(10000),
    ]);
    return (t.data ?? []).map((x: any) => ({
      ...x,
      keys: (k.data ?? []).filter((y: any) => y.tenant_id === x.id),
      members: (m.data ?? []).filter((y: any) => y.tenant_id === x.id).length,
      calls24h: (u.data ?? []).filter((y: any) => y.tenant_id === x.id).length,
      errors24h: (u.data ?? []).filter((y: any) => y.tenant_id === x.id && y.status >= 400).length,
    }));
  });

export const createPartnerTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(["b2b", "white_label"]), rateLimitPerMinute: z.number().int().min(1).max(1000).default(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    const { data: row, error } = await db.from("partner_tenants").insert({ name: data.name, kind: data.kind, rate_limit_per_minute: data.rateLimitPerMinute, created_by: context.userId }).select("id").single();
    if (error) throw new Error("Could not create partner");
    await audit("partner.create", { tenant: row.id, name: data.name });
    return { id: row.id as string };
  });

export const setPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    await db.from("partner_tenants").update({ status: data.status }).eq("id", data.tenantId);
    await audit("partner.status", data);
    return { ok: true };
  });

export const createPartnerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenantId: z.string().uuid(),
    label: z.string().trim().min(2).max(80),
    scopes: z.array(SCOPE).min(1),
    apiAccessMode: API_ACCESS_MODE.default("multi_product"),
    apiProducts: z.array(API_PRODUCT).min(1).max(9),
    expiresInDays: z.number().int().min(1).max(730).default(365),
  }).superRefine((v, ctx) => {
    if (v.apiAccessMode === "single_product" && v.apiProducts.length !== 1) ctx.addIssue({ code: "custom", path: ["apiProducts"], message: "single_product requires exactly one product" });
    if (v.apiAccessMode === "full_catalogue" && v.apiProducts.length !== 9) ctx.addIssue({ code: "custom", path: ["apiProducts"], message: "full_catalogue requires all products" });
    if (v.apiAccessMode === "multi_product" && v.apiProducts.length < 2) ctx.addIssue({ code: "custom", path: ["apiProducts"], message: "multi_product requires at least two products" });
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    const { mintKey } = await import("./partner-auth.server");
    const k = mintKey();
    const { data: row, error } = await db.from("partner_api_keys").insert({
      tenant_id: data.tenantId, label: data.label, key_prefix: k.prefix, key_hash: k.hash, scopes: data.scopes,
      api_products: data.apiProducts, api_access_mode: data.apiAccessMode,
      expires_at: new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString(), created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("Could not create key");
    await audit("partner.key.create", { tenant: data.tenantId, key: row.id, prefix: k.prefix, scopes: data.scopes });
    return { id: row.id as string, key: k.raw };
  });

export const revokePartnerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    await db.from("partner_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.keyId).is("revoked_at", null);
    await audit("partner.key.revoke", { key: data.keyId });
    return { ok: true };
  });

export const addPartnerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid(), email: z.string().email(), role: z.enum(["owner", "developer", "viewer"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    const { data: prof } = await db.from("profiles").select("id").ilike("email", data.email).maybeSingle();
    if (!prof) return { ok: false as const, error: "No Worldway account uses that email yet." };
    const { error } = await db.from("partner_members").upsert({ tenant_id: data.tenantId, user_id: prof.id, role: data.role }, { onConflict: "tenant_id,user_id" });
    if (error) throw new Error("Could not add member");
    await audit("partner.member.add", { tenant: data.tenantId, user: prof.id, role: data.role });
    return { ok: true as const };
  });

/** Rotate: mint a replacement key with the same label/scopes, then revoke the old one. Audited. */
export const rotatePartnerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    const { data: old } = await db.from("partner_api_keys").select("id, tenant_id, label, scopes, api_products, api_access_mode, expires_at, revoked_at").eq("id", data.keyId).maybeSingle();
    if (!old || old.revoked_at) throw new Error("Key not found or already revoked");
    const { mintKey } = await import("./partner-auth.server");
    const k = mintKey();
    const { data: row, error } = await db.from("partner_api_keys").insert({
      tenant_id: old.tenant_id, label: old.label, key_prefix: k.prefix, key_hash: k.hash, scopes: old.scopes,
      api_products: old.api_products ?? [], api_access_mode: old.api_access_mode ?? "multi_product",
      expires_at: old.expires_at ?? new Date(Date.now() + 365 * 86_400_000).toISOString(), created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("Could not rotate key");
    await db.from("partner_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", old.id);
    await audit("partner.key.rotate", { tenant: old.tenant_id, oldKey: old.id, newKey: row.id, prefix: k.prefix });
    return { id: row.id as string, key: k.raw };
  });

export const setPartnerRateLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid(), rateLimitPerMinute: z.number().int().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    await db.from("partner_tenants").update({ rate_limit_per_minute: data.rateLimitPerMinute }).eq("id", data.tenantId);
    await audit("partner.rate_limit", data);
    return { ok: true };
  });

/** Last 7 days of usage for one tenant, grouped by operation and status class. */
export const getPartnerUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await superAdmin(context);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: rows } = await db.from("partner_api_usage").select("operation, status, duration_ms, created_at").eq("tenant_id", data.tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
    const byOp: Record<string, { calls: number; errors: number; totalMs: number }> = {};
    for (const r of rows ?? []) {
      const o = (byOp[r.operation] ??= { calls: 0, errors: 0, totalMs: 0 });
      o.calls++; if (r.status >= 400) o.errors++; o.totalMs += r.duration_ms ?? 0;
    }
    return {
      operations: Object.entries(byOp).map(([operation, v]) => ({ operation, calls: v.calls, errors: v.errors, avgMs: Math.round(v.totalMs / v.calls) })),
      recent: (rows ?? []).slice(0, 25).map((r: any) => ({ at: r.created_at, operation: r.operation, status: r.status, ms: r.duration_ms })),
    };
  });
