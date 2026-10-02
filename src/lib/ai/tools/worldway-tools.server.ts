// The unified Worldway tool catalogue: Concierge commerce tools + MCP tools,
// all as Tool Fabric specs. MCP stays the external protocol boundary and calls
// into this fabric; the fabric is the internal authority.
import { z } from "zod";
import { CommerceSchemas, runCommerce, type CommerceOp } from "@/lib/commerce/commerce.server";
import { ToolRegistry, type RiskLevel, type ToolSpec } from "./fabric";

const COMMERCE: { name: string; op: CommerceOp; risk: RiskLevel; description: string }[] = [
  { name: "search_flights", op: "searchFlights", risk: "SEARCH", description: "Search live flights (one-way or return). Returns live fares." },
  { name: "search_tours", op: "searchTours", risk: "SEARCH", description: "Search the Worldway tour catalogue by keywords, city or country. 'from' prices are indicative." },
  { name: "tour_availability", op: "tourAvailability", risk: "SEARCH", description: "Live open dates and per-adult prices for a tour from a date." },
  { name: "quote_tour", op: "quoteTour", risk: "QUOTE", description: "Live total price for a tour on a date for a group. Use before stating any tour total." },
  { name: "plan_trip", op: "planTrip", risk: "QUOTE", description: "Build a live trip plan: flights out and back, hotels from the arrival date, optional tour selection (tour_ref from its tours list), optional stays, FX-converted totals." },
];

export function commerceSpecs(): ToolSpec<any, any>[] {
  return COMMERCE.map((d) => ({
    name: d.name, version: "1.0.0", description: d.description, input: CommerceSchemas[d.op] as any,
    contexts: ["concierge_chat", "concierge_voice", "agent_runtime", "partner_api"], requiresAuth: false,
    timeoutMs: 120_000, retries: 0, // supplier calls are never auto-retried by AI
    risk: d.risk, permission: "public", scopes: d.risk === "QUOTE" ? ["commerce:read", "commerce:quote"] : ["commerce:read"],
    audit: "trace", untrustedOutput: true,
    execute: async (input: unknown) => {
      const r = await runCommerce(d.op, input);
      if (!r.ok) throw new Error(r.error ?? "Tool failed");
      return r;
    },
  }));
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sanitize = async (res: unknown) => (await import("@/lib/confidentiality/guard.server")).sanitizeOutbound(res, { absolute: true });

/** MCP tool specs (names/versions match the published MCP tools). */
export function mcpSpecs(): ToolSpec<any, any>[] {
  return [
    {
      name: "mcp_search_flights", version: "1.0.0", description: "MCP: search live Worldway flights.",
      input: z.object({ origin: z.string().min(2).max(60), destination: z.string().min(2).max(60), depart_date: date, return_date: date.optional(), passengers: z.number().int().min(1).max(9).default(1), cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy") }),
      risk: "SEARCH", permission: "public", scopes: ["commerce:read"], audit: "trace", contexts: ["mcp", "agent_runtime"], requiresAuth: false, timeoutMs: 90_000, retries: 0, untrustedOutput: true,
      execute: async (input) => {
        const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
        const { outcomes: _routing, ...res } = await searchFlightsViaEngine(input);
        return sanitize(res);
      },
    },
    {
      name: "search_hotels", version: "1.0.0", description: "Search live hotel availability and rates from Worldway.",
      input: z.object({ destination: z.string().min(2).max(120), check_in: date, check_out: date, guests: z.number().int().min(1).max(20).default(2), rooms: z.number().int().min(1).max(9).default(1) }),
      risk: "SEARCH", permission: "public", scopes: ["commerce:read"], audit: "trace", contexts: ["mcp", "agent_runtime"], requiresAuth: false, timeoutMs: 90_000, retries: 0, untrustedOutput: true,
      execute: async (input) => {
        const { callPartner, toPartnerHotelPayload } = await import("@/lib/wwl.server");
        return sanitize(await callPartner("hotels", toPartnerHotelPayload(input)));
      },
    },
    {
      name: "wallet_balance", version: "1.0.0", description: "Signed-in user's wallet balances.",
      input: z.object({ clientEmail: z.string().email() }),
      risk: "READ", permission: "authenticated", scopes: ["wallet:read"], audit: "trace", contexts: ["mcp"], requiresAuth: true, timeoutMs: 30_000, retries: 1,
      execute: async (input) => {
        const { callPartner } = await import("@/lib/wwl.server");
        return sanitize(await callPartner("walletBalance", input));
      },
    },
    {
      name: "wallet_transactions", version: "1.0.0", description: "Signed-in user's recent wallet transactions.",
      input: z.object({ clientEmail: z.string().email(), limit: z.number().int().min(1).max(100).default(20) }),
      risk: "READ", permission: "authenticated", scopes: ["wallet:read"], audit: "trace", contexts: ["mcp"], requiresAuth: true, timeoutMs: 30_000, retries: 1,
      execute: async (input) => {
        const { callPartner } = await import("@/lib/wwl.server");
        return sanitize(await callPartner("walletTransactions", input));
      },
    },
  ];
}

let cached: ToolRegistry | null = null;
export function worldwayRegistry(): ToolRegistry {
  if (cached) return cached;
  const r = new ToolRegistry();
  for (const s of [...commerceSpecs(), ...mcpSpecs()]) r.register(s);
  return (cached = r);
}
