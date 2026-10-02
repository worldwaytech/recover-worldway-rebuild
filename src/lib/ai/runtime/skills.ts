// Initial Worldway skills (READ/SEARCH/ANALYZE/SIMULATE/QUOTE only). Skills plan
// steps over approved fabric tools or call pure deterministic engines — never suppliers.
import type { RiskLevel } from "../tools/fabric";
import type { ValidatedStep } from "./plan-validation";
import type { TripRequirements } from "@/lib/engine/types";
import type { TravelAgentContext } from "./travel-context";

export interface SkillGoal {
  requirements?: Partial<TripRequirements> & { checkIn?: string; checkOut?: string; cabin?: string };
  query?: string;
  country?: string;
  supplierKeys?: string[];
  /** Consent-gated personalization context. Current request remains authoritative. */
  travelContext?: TravelAgentContext;
}

export interface SkillDef {
  name: string;
  description: string;
  tools: string[];
  allowedRisk: RiskLevel[];
  /** Builds tool steps (validated before execution). */
  plan?(goal: SkillGoal): ValidatedStep[];
  /** Pure deterministic analysis (no tools). */
  analyze?(goal: SkillGoal): Promise<unknown>;
}

const ev = (ref: string) => [{ source: "engine", ref }];
const pax = (r: SkillGoal["requirements"]) => Math.max(1, (r?.adults ?? 1) + (r?.children ?? 0));

export const SKILLS: SkillDef[] = [
  {
    name: "travel-requirements", description: "Turn extracted intent into validated trip requirements (deterministic).", tools: [], allowedRisk: ["ANALYZE"],
    analyze: async (g) => {
      const r = g.requirements ?? {};
      const missing = (["origin", "departFrom", "returnBy", "adults"] as const).filter((k) => r[k] == null);
      if (!r.destinations?.length) missing.push("destinations" as never);
      return { complete: missing.length === 0, missing, personalization: g.travelContext ? { available: true, memoryCount: g.travelContext.memories.length, precedence: g.travelContext.precedence } : { available: false } };
    },
  },
  {
    name: "flight-analysis", description: "Live flight options for the requirements.", tools: ["search_flights"], allowedRisk: ["SEARCH"],
    plan: (g) => { const r = g.requirements!; return [{ tool: "search_flights", input: { origin: r.origin, destination: r.destinations?.[0], depart_date: r.departFrom, return_date: r.returnBy, passengers: pax(r), cabin: r.cabin ?? "economy" } }]; },
  },
  {
    name: "hotel-analysis", description: "Live hotel availability for the stay.", tools: ["search_hotels"], allowedRisk: ["SEARCH"],
    plan: (g) => { const r = g.requirements!; return [{ tool: "search_hotels", input: { destination: r.destinations?.[0], check_in: r.checkIn ?? r.departFrom, check_out: r.checkOut ?? r.returnBy, guests: pax(r), rooms: 1 } }]; },
  },
  {
    name: "tour-analysis", description: "Tour catalogue search for the destination.", tools: ["search_tours", "tour_availability"], allowedRisk: ["SEARCH"],
    plan: (g) => [{ tool: "search_tours", input: { query: g.query, city: g.requirements?.destinations?.[0], page: 1 } }],
  },
  {
    name: "trip-planning", description: "Live end-to-end trip plan (flights, hotels from arrival, optional tour).", tools: ["plan_trip"], allowedRisk: ["QUOTE"],
    plan: (g) => { const r = g.requirements!; return [{ tool: "plan_trip", input: { origin: r.origin, destination: r.destinations?.[0], depart_date: r.departFrom, return_date: r.returnBy, adults: r.adults ?? 1, children: r.children ?? 0 }, evidence: ev("requirements") }]; },
  },
  {
    name: "package-analysis", description: "Package-level live plan for audit and comparison.", tools: ["plan_trip"], allowedRisk: ["QUOTE"],
    plan: (g) => SKILLS.find((s) => s.name === "trip-planning")!.plan!(g),
  },
  {
    name: "destination-intelligence", description: "Destination insight from the Worldway catalogue (deterministic).", tools: [], allowedRisk: ["ANALYZE"],
    analyze: async (g) => {
      if (!g.country) return { ok: false, reason: "country_required" };
      const { getDestinationIntel } = await import("@/lib/destination-intel.server");
      return { ok: true, intel: await getDestinationIntel(g.country) };
    },
  },
  {
    name: "booking-readiness-audit", description: "Which partners are production-certified to book (deterministic, no supplier names leave the server).", tools: [], allowedRisk: ["ANALYZE"],
    analyze: async (g) => {
      const [{ supplierRegistry }, { bookingBlockers }] = await Promise.all([import("@/lib/engine/suppliers/catalog.server"), import("@/lib/engine/capabilities")]);
      const reg = supplierRegistry();
      const keys = g.supplierKeys?.length ? g.supplierKeys : [...reg.keys()];
      return keys.map((k, i) => ({ partner: `partner_${i + 1}`, bookable: bookingBlockers(reg.get(k)).length === 0, blockers: bookingBlockers(reg.get(k)) }));
    },
  },
];

export const skill = (name: string) => SKILLS.find((s) => s.name === name);
