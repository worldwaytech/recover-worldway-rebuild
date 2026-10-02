// Existing live commerce tools registered in the Tool Fabric. Execution still goes
// through runCommerce (the single commerce home) — no new supplier logic.
import { tool } from "ai";
import { CommerceSchemas, runCommerce, type CommerceOp } from "@/lib/commerce/commerce.server";
import { ToolRegistry, type RiskLevel, type ToolContext } from "./fabric";
import { newCorrelationId } from "../router/telemetry";

const DEFS: { name: string; op: CommerceOp; risk: RiskLevel; description: string }[] = [
  { name: "search_flights", op: "searchFlights", risk: "SEARCH", description: "Search live flights (one-way or return). Returns live fares." },
  { name: "search_tours", op: "searchTours", risk: "SEARCH", description: "Search the Worldway tour catalogue by keywords, city or country. 'from' prices are indicative." },
  { name: "tour_availability", op: "tourAvailability", risk: "SEARCH", description: "Live open dates and per-adult prices for a tour from a date." },
  { name: "quote_tour", op: "quoteTour", risk: "QUOTE", description: "Live total price for a tour on a date for a group. Use before stating any tour total." },
  { name: "plan_trip", op: "planTrip", risk: "QUOTE", description: "Build a live trip plan: flights out and back, hotels from the arrival date, optional tour selection (tour_ref from its tours list), optional stays, FX-converted totals." },
];

export function commerceRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  for (const d of DEFS) reg.register({
    name: d.name, description: d.description, input: CommerceSchemas[d.op] as any,
    version: "1.0.0", contexts: ["concierge_chat", "concierge_voice", "agent_runtime"], requiresAuth: false,
    timeoutMs: 120_000, retries: 0, // supplier calls are never auto-retried by AI
    risk: d.risk, permission: "public", scopes: d.risk === "QUOTE" ? ["commerce:read", "commerce:quote"] : ["commerce:read"],
    audit: "trace", untrustedOutput: true,
    execute: async (input) => {
      const r = await runCommerce(d.op, input);
      if (!r.ok) throw new Error(r.error ?? "Tool failed");
      return r;
    },
  });
  return reg;
}

/** Concierge principal: public, read/quote only. Never has high-risk grants. */
export function conciergeContext(correlationId = newCorrelationId(), signal?: AbortSignal, context: ToolContext["context"] = "concierge_chat"): ToolContext {
  return { correlationId, context, principal: { permission: "public", scopes: ["commerce:read", "commerce:quote"] }, signal };
}

/** AI SDK tool set backed by the fabric (policy, schema, safety, audit on every call). */
export function aiSdkTools(reg: ToolRegistry, ctx: ToolContext, onResult?: (name: string, ok: boolean) => void) {
  return Object.fromEntries(reg.visible(ctx).map((t) => [t.name, tool({
    description: t.description,
    inputSchema: t.input as any,
    execute: async (input: unknown) => {
      try { const r = await reg.invoke(t.name, input, ctx); onResult?.(t.name, true); return r; }
      catch (e) { onResult?.(t.name, false); throw e; }
    },
  })]));
}
