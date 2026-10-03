// Worldway Travel Commerce API — partner authentication & tenancy (server-only).
// Two credential types, one principal shape:
//   • API key (machine-to-machine): "wwk_live_…", stored only as HMAC-SHA256(pepper).
//   • OAuth (partner users): a Worldway access token for a member of the tenant.
// Every call is scope-checked, rate-limited per tenant and logged. A signed-request
// or MFA check can be added in authenticatePartner() without touching callers.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CommerceOp } from "./commerce.server";

export const SCOPES = [
  "flights.search", "tours.read", "tours.quote", "trips.plan",
  "catalog.read", "pricing.quote", "booking.read", "booking.write",
  "payment.write", "wallet.read", "wallet.reserve",
] as const;
export type Scope = (typeof SCOPES)[number];

export const OP_SCOPE: Record<CommerceOp, Scope> = {
  searchFlights: "flights.search",
  searchTours: "tours.read",
  tourAvailability: "tours.read",
  quoteTour: "tours.quote",
  planTrip: "trips.plan",
};

const ROLE_SCOPES: Record<string, Scope[]> = {
  owner: [...SCOPES],
  developer: [...SCOPES],
  viewer: ["flights.search", "tours.read"],
};

export interface PartnerPrincipal {
  tenantId: string;
  method: "api_key" | "oauth";
  keyId: string | null;
  userId: string | null;
  scopes: Scope[];
  rateLimitPerMinute: number;
}

export class PartnerAuthError extends Error {
  constructor(public status: 401 | 403 | 429, message: string) { super(message); }
}

function pepper() {
  const p = process.env["PARTNER_KEY_PEPPER"];
  if (!p) throw new Error("PARTNER_KEY_PEPPER not configured");
  return p;
}

export function hashKey(raw: string) {
  return createHmac("sha256", pepper()).update(raw).digest("hex");
}

/** New key: returns the one-time plaintext and what is stored. */
export function mintKey() {
  const raw = `wwk_live_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 13), hash: hashKey(raw) };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function sameHash(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function authenticatePartner(request: Request): Promise<PartnerPrincipal> {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const raw = request.headers.get("x-api-key")?.trim() || (bearer.startsWith("wwk_") ? bearer : "");
  const db = await admin();

  if (raw) {
    if (!/^wwk_live_[A-Za-z0-9_-]{43}$/.test(raw)) throw new PartnerAuthError(401, "Invalid API key");
    const h = hashKey(raw);
    const { data: key } = await db.from("partner_api_keys").select("id, tenant_id, key_hash, scopes, expires_at, revoked_at").eq("key_hash", h).maybeSingle();
    if (!key || !sameHash(key.key_hash, h)) throw new PartnerAuthError(401, "Invalid API key");
    if (key.revoked_at) throw new PartnerAuthError(401, "API key revoked");
    if (key.expires_at && Date.parse(key.expires_at) < Date.now()) throw new PartnerAuthError(401, "API key expired");
    const tenant = await activeTenant(db, key.tenant_id);
    await db.from("partner_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    return { tenantId: tenant.id, method: "api_key", keyId: key.id, userId: null, scopes: (key.scopes ?? []).filter((s: string): s is Scope => (SCOPES as readonly string[]).includes(s)), rateLimitPerMinute: tenant.rate_limit_per_minute };
  }

  if (bearer) {
    const { data: u, error } = await db.auth.getUser(bearer);
    if (error || !u?.user) throw new PartnerAuthError(401, "Invalid or expired access token");
    const wanted = request.headers.get("x-worldway-tenant");
    let q = db.from("partner_members").select("tenant_id, role").eq("user_id", u.user.id);
    if (wanted) q = q.eq("tenant_id", wanted);
    const { data: rows } = await q;
    if (!rows?.length) throw new PartnerAuthError(403, "This account is not a member of a partner tenant");
    if (rows.length > 1) throw new PartnerAuthError(403, "Select a tenant with the X-Worldway-Tenant header");
    const tenant = await activeTenant(db, rows[0]!.tenant_id);
    return { tenantId: tenant.id, method: "oauth", keyId: null, userId: u.user.id, scopes: ROLE_SCOPES[rows[0]!.role] ?? [], rateLimitPerMinute: tenant.rate_limit_per_minute };
  }

  throw new PartnerAuthError(401, "Missing credentials");
}

async function activeTenant(db: any, id: string) {
  const { data: t } = await db.from("partner_tenants").select("id, status, rate_limit_per_minute").eq("id", id).maybeSingle();
  if (!t) throw new PartnerAuthError(401, "Unknown tenant");
  if (t.status !== "active") throw new PartnerAuthError(403, "Tenant suspended");
  return t as { id: string; status: string; rate_limit_per_minute: number };
}

export function requireScope(p: PartnerPrincipal, op: CommerceOp) {
  if (!p.scopes.includes(OP_SCOPE[op])) throw new PartnerAuthError(403, `Missing scope ${OP_SCOPE[op]}`);
}

export async function enforceRateLimit(p: PartnerPrincipal) {
  const db = await admin();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("partner_api_usage").select("id", { count: "exact", head: true }).eq("tenant_id", p.tenantId).gte("created_at", since);
  if ((count ?? 0) >= p.rateLimitPerMinute) throw new PartnerAuthError(429, "Rate limit exceeded");
}

export async function logUsage(p: Pick<PartnerPrincipal, "tenantId" | "keyId" | "userId" | "method">, operation: string, status: number, ms: number) {
  const db = await admin();
  await db.from("partner_api_usage").insert({ tenant_id: p.tenantId, key_id: p.keyId, user_id: p.userId, auth_method: p.method, operation, status, duration_ms: ms });
}
