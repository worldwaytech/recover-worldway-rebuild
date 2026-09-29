// Server-side supplier-privacy guard for EVERY browser/B2B/API/MCP payload.
// - Supplier identity/metadata fields  -> sealed Worldway references (wwr_…)
// - Supplier/operator/brand names in text -> neutral Worldway wording
// - Third-party image URLs -> /media/s.<ref>; other third-party links -> /go/<ref>
// Inbound: sealed references are restored before handlers run, so existing
// supplier, pricing and booking logic is unchanged.
import { redactNames } from "./redact";
import { isSealed, seal, unseal } from "./seal.server";

/** Fields that identify a supplier, its routing or its internal ids. */
export const SEAL_KEY =
  /^(supplier.*|provider.*|vendor.*|adapter.*|upstream.*|routing|outcomes|failover.*|endpoint.*|source(_?system|_?key|_?url|_?name|_?id)?|partner_?(id|key|name|code|ref.*)|raw.*|credential.*|api_?key|secret.*|access_?token|search_?token_?id|trace_?id|result_?index|ticket_?id|fare_?id|rate_?key|affiliate.*|brand_?(label|name)|operator_?(id|code|name)|origin_?system|connector.*|integration.*)$/i;

/** Operational supplier-named fields the UI renders; contents are still reworded. */
const KEEP_KEY = /^supplier_?(times|status_?label)$/i;

/** Identifier-like fields: never reworded (URLs/filters/booking depend on them). */
const IDENT_KEY =
  /^(id|slug|code|brand|key|type|kind|status|currency|href|path|to|mode|purpose|category|reference|ref)$|(_id|Id|_code|Code|_key|Key|_type|Type|_ref|Ref|_slug|Slug)$/;

const IMAGE_KEY = /(image|img|photo|picture|thumb|logo|banner|cover|media|gallery|src|poster|hero)/i;

const PASS_HOSTS = [
  /(^|\.)worldwaytravelsgroup\.com$/i, /(^|\.)lovable\.app$/i, /(^|\.)unsplash\.com$/i,
  /(^|\.)supabase\.co$/i, /(^|\.)razorpay\.com$/i, /(^|\.)google\.com$/i, /(^|\.)googleapis\.com$/i,
  /(^|\.)gstatic\.com$/i, /(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i, /(^|\.)vimeo\.com$/i, /^wa\.me$/i,
];

function hostOf(u: string): string | null {
  try {
    return new URL(u.startsWith("//") ? `https:${u}` : u).hostname;
  } catch {
    return null;
  }
}
function isThirdParty(u: string) {
  const h = hostOf(u);
  return !!h && !PASS_HOSTS.some((re) => re.test(h));
}
const IMG_EXT = /\.(jpe?g|png|webp|avif|gif|svg)(\?|#|$)/i;

export type SanitizeOptions = { absolute?: boolean };

async function neutralUrl(u: string, key: string, opt: SanitizeOptions) {
  const full = u.startsWith("//") ? `https:${u}` : u;
  const isImg = IMG_EXT.test(full) || IMAGE_KEY.test(key) || /\/(image|img|photo|media|cdn)/i.test(full);
  const path = isImg ? `/media/s.${await seal(full)}` : `/go/${await seal(full)}`;
  return opt.absolute ? `https://worldwaytravelsgroup.com${path}` : path;
}

const URL_ONLY = /^(https?:)?\/\/[^\s]+$/i;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/gi;

async function cleanString(s: string, key: string, opt: SanitizeOptions): Promise<string> {
  if (isSealed(s)) return s;
  if (URL_ONLY.test(s)) return isThirdParty(s) ? neutralUrl(s, key, opt) : s;
  // Identifier codes stay intact; human-readable labels (with spaces) are still reworded.
  if (IDENT_KEY.test(key) && !/\s/.test(s)) return s;
  let out = s;
  const urls = s.match(URL_IN_TEXT);
  if (urls) {
    for (const u of new Set(urls)) if (isThirdParty(u)) out = out.split(u).join(await neutralUrl(u, key, opt));
  }
  return redactNames(out);
}

function isPlain(v: object) {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/** Contractual review attribution (Viator/Tripadvisor) — the single exemption. */
function isReviewAttribution(obj: Record<string, unknown>, k: string, v: unknown) {
  return /^provider$/i.test(k) && typeof v === "string" && /^(TRIPADVISOR|VIATOR)$/i.test(v) &&
    ("rating" in obj || "text" in obj || "reviewText" in obj);
}

/** Generic category values are not supplier identity and stay readable. */
const NEUTRAL_VALUE =
  /^(all|none|hotels?|flights?|activit(y|ies)|transfers?|cruises?|tours?|bus(es)?|rail|trains?|cars?|cabs?|villas?|yachts?|packages?|insurance|travel_protection|visa|private_aviation|empty_legs?|wallet|web|app|manual|razorpay|worldway|live|demo|mock|internal|b2b|b2c|admin)$/i;

export async function sanitizeOutbound<T>(value: T, opt: SanitizeOptions = {}): Promise<T> {
  const walk = async (v: unknown, key: string): Promise<unknown> => {
    if (typeof v === "string") return cleanString(v, key, opt);
    if (Array.isArray(v)) return Promise.all(v.map((x) => walk(x, key)));
    if (v && typeof v === "object" && isPlain(v)) {
      const obj = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(obj)) {
        if (isReviewAttribution(obj, k, val)) {
          out[k] = val; // confidentiality-exempt: contractual review attribution
          continue;
        }
        if (/^raw([A-Z_].*)?$/.test(k) || /^raw$/i.test(k)) continue; // raw supplier payloads never leave
        if (typeof val === "string" && SEAL_KEY.test(k) && URL_ONLY.test(val)) {
          out[k] = isThirdParty(val) ? await neutralUrl(val, k, opt) : val;
        } else if (val !== null && val !== undefined && val !== "" && SEAL_KEY.test(k) && !KEEP_KEY.test(k) && !(typeof val === "string" && NEUTRAL_VALUE.test(val)) && typeof val !== "boolean" && !isReviewAttribution(obj, k, val)) {
          out[k] = await seal(val);
        } else {
          out[k] = await walk(val, k);
        }
      }
      return out;
    }
    return v;
  };
  return (await walk(value, "")) as T;
}

/** Restore sealed references inside inbound data (deep). */
export async function restoreInbound<T>(value: T): Promise<T> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (isSealed(v)) {
      const r = await unseal(v);
      return r === undefined ? v : r;
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === "object" && isPlain(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = await walk(val);
      return out;
    }
    return v;
  };
  return (await walk(value)) as T;
}

export function redactError(e: unknown) {
  if (e instanceof Error && typeof e.message === "string") {
    try {
      e.message = redactNames(e.message.replace(URL_IN_TEXT, (u) => (isThirdParty(u) ? "[link]" : u)));
    } catch {
      /* ignore */
    }
  }
}

const staffCache = new Map<string, { v: boolean; at: number }>();

/** True only for verified Admin/Super Admin callers (server-side role check). */
export async function callerIsStaff(authorization: string | null | undefined): Promise<boolean> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.split(".").length !== 3) return false;
  const hit = staffCache.get(token);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  let v = false;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data } = await sb.auth.getUser(token);
    if (data.user) {
      const r = await sb.rpc("is_staff", { _user_id: data.user.id });
      v = r.data === true;
    }
  } catch {
    v = false;
  }
  if (staffCache.size > 1000) staffCache.clear();
  staffCache.set(token, { v, at: Date.now() });
  return v;
}
