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
  { id: "flight", label: "Flight Agent", handles: /\b(flight|fly|airline|fare|cabin)\b/i, skills: ["flight-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "hotel", label: "Hotel Agent", handles: /\b(hotel|stay|room|resort|villa)\b/i, skills: ["hotel-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "tour", label: "Tour Agent", handles: /\b(tour|activity|excursion|sightseeing)\b/i, skills: ["tour-analysis"], allowedRisk: ["SEARCH"], available: true },
  { id: "package", label: "Package Agent", handles: /\b(trip|package|holiday|itinerary|plan)\b/i, skills: ["travel-requirements", "trip-planning", "package-analysis"], allowedRisk: ["ANALYZE", "QUOTE"], available: true },
  { id: "destination_intelligence", label: "Destination Intelligence Agent", handles: /\b(destination|weather|season|things to do|guide)\b/i, skills: ["destination-intelligence"], allowedRisk: ["ANALYZE"], available: true },
  { id: "auditor", label: "Auditor Agent", handles: /\b(audit|ready|readiness|bookable|check)\b/i, skills: ["booking-readiness-audit"], allowedRisk: ["ANALYZE"], available: true },
  { id: "cruise", label: "Cruise Agent", handles: /\b(cruise|sailing|voyage|ship)\b/i, skills: [], allowedRisk: ["SEARCH"], available: false, note: "No AI cruise tool in the fabric yet; cruise search stays in the existing cruise pages." },
  { id: "transfer", label: "Transfer Agent", handles: /\b(transfer|pickup|cab|taxi|chauffeur)\b/i, skills: [], allowedRisk: ["SEARCH"], available: false, note: "No AI transfer tool in the fabric yet." },
  { id: "private_aviation", label: "Private Aviation Agent", handles: /\b(private jet|charter|aviation|empty leg)\b/i, skills: [], allowedRisk: ["READ"], available: false, note: "Private aviation is enquiry-led and handled by the Worldway team." },
  { id: "visa_policy", label: "Visa/Policy Agent", handles: /\b(visa|passport|entry|policy|requirement)\b/i, skills: [], allowedRisk: ["READ"], available: false, note: "No authoritative visa data source is connected; the agent must refer to official sources." },
];

/** Supervisor routing: matching AND available specialists only. */
export function chooseSpecialists(task: string): { chosen: SpecialistConfig[]; unavailable: SpecialistConfig[] } {
  const matched = SPECIALISTS.filter((s) => s.handles.test(task));
  return { chosen: matched.filter((s) => s.available), unavailable: matched.filter((s) => !s.available) };
}
