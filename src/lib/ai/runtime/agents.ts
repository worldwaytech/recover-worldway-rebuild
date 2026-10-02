// Specialist agents = typed configuration over the shared runtime (not separate systems).
import type { RiskLevel } from "../tools/fabric";

export type SpecialistId = "flight" | "hotel" | "tour" | "cruise" | "transfer" | "private_aviation" | "destination_intelligence" | "visa_policy" | "package" | "auditor";

export interface SpecialistConfig {
  id: SpecialistId;
  label: string;
  /** Task keywords the supervisor matches on. */
  handles: RegExp;
  skills: string[];
  allowedRisk: RiskLevel[];
  /** True when the platform has an approved deterministic tool path today. */
  available: boolean;
  note?: string;
}

export const SPECIALISTS: SpecialistConfig[] = [
  { id: "flight", label: "Flight Agent", handles: /\b(flights?|flys?|airlines?|fares?|cabins?)\b/i, skills: ["flight-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "hotel", label: "Hotel Agent", handles: /\b(hotels?|stays?|rooms?|resorts?|villas?)\b/i, skills: ["hotel-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "tour", label: "Tour Agent", handles: /\b(tours?|activitys?|excursions?|sightseeings?)\b/i, skills: ["tour-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "package", label: "Package Agent", handles: /\b(trips?|packages?|holidays?|itinerarys?|plans?)\b/i, skills: ["travel-requirements", "trip-planning", "package-analysis"], allowedRisk: ["ANALYZE", "QUOTE"], available: true },
  { id: "destination_intelligence", label: "Destination Intelligence Agent", handles: /\b(destinations?|weathers?|seasons?|things to do|guides?)\b/i, skills: ["destination-intelligence"], allowedRisk: ["ANALYZE"], available: true },
  { id: "auditor", label: "Auditor Agent", handles: /\b(audits?|readys?|readiness|bookables?|checks?)\b/i, skills: ["booking-readiness-audit"], allowedRisk: ["ANALYZE"], available: true },
  { id: "cruise", label: "Cruise Agent", handles: /\b(cruises?|sailings?|voyages?|ships?)\b/i, skills: [], allowedRisk: ["SEARCH"], available: false, note: "No AI cruise tool in the fabric yet; cruise search stays in the existing cruise pages." },
  { id: "transfer", label: "Transfer Agent", handles: /\b(transfers?|pickups?|cabs?|taxis?|chauffeurs?)\b/i, skills: [], allowedRisk: ["SEARCH"], available: false, note: "No AI transfer tool in the fabric yet." },
  { id: "private_aviation", label: "Private Aviation Agent", handles: /\b(private jet|charters?|aviations?|empty leg)\b/i, skills: [], allowedRisk: ["READ"], available: false, note: "Private aviation is enquiry-led and handled by the Worldway team." },
  { id: "visa_policy", label: "Visa/Policy Agent", handles: /\b(visas?|passports?|entrys?|policys?|requirements?)\b/i, skills: [], allowedRisk: ["READ"], available: false, note: "No authoritative visa data source is connected; the agent must refer to official sources." },
];

/** Supervisor routing: matching AND available specialists only. */
export function chooseSpecialists(task: string): { chosen: SpecialistConfig[]; unavailable: SpecialistConfig[] } {
  const matched = SPECIALISTS.filter((s) => s.handles.test(task));
  return { chosen: matched.filter((s) => s.available), unavailable: matched.filter((s) => !s.available) };
}
