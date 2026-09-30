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

const SCOPE = z.enum(["flights.search", "tours.read", "tours.quote", "trips.plan"]);

export const listPartnerTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await superAdmin(context);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [t, k, m, u] = await Promise.all([
      db.from("partner_tenants").select("id, name, kind, status, rate_limit_per_minute, created_at").order("created_at", { ascending: false }),
      db.from("partner_api_keys").select("id, tenant_id, label, key_prefix, scopes, expires_at, revoked_at, last_used_at, created_at").order("created_at", { ascending: false }),
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
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid(), label: z.string().trim().min(2).max(80), scopes: z.array(SCOPE).min(1), expiresInDays: z.number().int().min(1).max(730).default(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, audit } = await superAdmin(context);
    const { mintKey } = await import("./partner-auth.server");
    const k = mintKey();
    const { data: row, error } = await db.from("partner_api_keys").insert({
      tenant_id: data.tenantId, label: data.label, key_prefix: k.prefix, key_hash: k.hash, scopes: data.scopes,
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
