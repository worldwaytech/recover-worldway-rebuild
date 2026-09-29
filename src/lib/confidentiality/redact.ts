// Global supplier-confidentiality layer for every EXTERNAL response
// (customers, B2B, API partners, MCP/AI consumers, public endpoints).
// Admin/Ops/audit views must NOT use this — they keep real supplier data.
//
// Future suppliers are covered automatically: names/ids come from the partner
// registry plus this list, and supplier-metadata keys are stripped by pattern.
import { PARTNER_CONNECTORS } from "@/lib/partners/registry";
import { isThirdPartyUrl, mediaUrl } from "@/lib/media";

const KNOWN_SUPPLIER_TERMS = [
  "HBX", "Hotelbeds", "RateHawk", "Emerging Travel Group", "ETG", "Viator", "TripAdvisor",
  "UP17", "TBO", "TBO Holidays", "TripJack", "TripSafe", "AIR iQ", "AirIQ", "Villiers",
  "G Adventures", "Bokun", "Bókun", "OCTO", "Crystal Cruises", "Abercrombie & Kent", "A&K",
  "AKTG", "TTC", "The Travel Corporation", "TourRadar", "Sabre", "Amadeus", "Travelport",
  "WorldwayLuxe", "Worldway Luxe Partner API", "worldwayluxe.com",
  "Abercrombie", "Contiki", "Insight Vacations", "Luxury Gold", "CostSaver", "AAT Kings",
  "Brendan Vacations", "Uniworld", "Hotelbeds Group",
];

/** Keys that carry supplier identity, routing or credentials — never external. */
const INTERNAL_KEY =
  /^(supplier.*|provider.*|vendor.*|adapter.*|upstream.*|routing|outcomes|failover.*|endpoint.*|source(_?system|_?key)?|partner_?(id|key|name)|raw.*|credential.*|api_?key|secret.*|access_?token|search_?token_?id|result_?index|ticket_?id|affiliate.*)$/i;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let termRe: RegExp | null = null;
export function supplierTerms(): string[] {
  const fromRegistry = PARTNER_CONNECTORS.flatMap((c) => [c.name, c.id]).filter(
    (t) => t && !/^worldway$/i.test(t),
  );
  return [...new Set([...KNOWN_SUPPLIER_TERMS, ...fromRegistry])].sort((a, b) => b.length - a.length);
}
function re() {
  if (!termRe) termRe = new RegExp(`(?<![\\w])(${supplierTerms().map(escape).join("|")})(?![\\w])`, "gi");
  termRe.lastIndex = 0;
  return termRe;
}
function has(s: string) {
  return new RegExp(re().source, "i").test(s);
}

/** Replace supplier/operator/brand names in free text (no URL handling). */
export function redactNames(s: string): string {
  if (!has(s)) return s;
  return s.replace(re(), "Worldway").replace(/Worldway(\s+Worldway)+/g, "Worldway");
}

/** Replace supplier names/hosts in free text with Worldway branding. */
export function redactText(s: string): string {
  return s
    .replace(/https?:\/\/[^\s"'<>]+/gi, (u) =>
      /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(u) || /image|img|photo|media|cdn/i.test(u)
        ? mediaUrl(u, true)
        : isThirdPartyUrl(u) ? "[worldway]" : u,
    )
    .replace(re(), "Worldway")
    .replace(/Worldway(\s+Worldway)+/g, "Worldway");
}

/** Deep-sanitize any value before it leaves Worldway. */
export function redactForExternal<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redactText(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (INTERNAL_KEY.test(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** Find leaks (for tests / monitoring). Returns offending paths. */
export function findSupplierLeaks(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return has(value) ? [path] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => findSupplierLeaks(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      INTERNAL_KEY.test(k) ? [`${path}.${k}`] : findSupplierLeaks(v, `${path}.${k}`),
    );
  return [];
}

/** Standard safe MCP tool result. */
export function externalToolResult(res: unknown, isError: boolean) {
  const safe = redactForExternal(res);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(safe) }],
    structuredContent: safe as Record<string, unknown>,
    isError,
  };
}
