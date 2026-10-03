// Post-Phase-16 technology and supplier reassessment.
// This is a decision gate, not a vendor ranking.
// A candidate cannot become production-active from this registry alone.
// Supplier certification and deterministic capability evidence remain authoritative.

export type ReassessmentDisposition =
  | "integrate_candidate"
  | "certify_existing"
  | "strategic_evaluate"
  | "watchlist"
  | "defer";

export type ReassessmentDomain =
  | "hotel_connectivity"
  | "hotel_distribution"
  | "payments"
  | "travel_risk"
  | "air_content"
  | "corporate_travel"
  | "experience_content"
  | "general_connectivity";

export interface TechnologyCandidate {
  key: string;
  domain: ReassessmentDomain;
  disposition: ReassessmentDisposition;
  rationale: string;
  architectureFit: readonly string[];
  prerequisites: readonly string[];
  doesNotReplace: readonly string[];
  evidenceDate: string;
  officialEvidence: readonly string[];
}

export const TECHNOLOGY_REASSESSMENT: readonly TechnologyCandidate[] = [
  {
    key: "travelgate",
    domain: "hotel_connectivity",
    disposition: "integrate_candidate",
    rationale: "Evaluate as an aggregation/connectivity layer for hotel, transfer and tour supply where it reduces bilateral integration cost.",
    architectureFit: ["normalized multi-supplier inventory", "supplier adapter registry", "booking readiness"],
    prerequisites: ["commercial/API access", "sandbox certification", "production booking evidence", "mapping and cancellation tests"],
    doesNotReplace: ["Worldway package orchestration", "ranking", "pricing", "supplier certification"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://docs.travelgate.com/docs/apis/overview/", "https://travelgate.com/apis"],
  },
  {
    key: "derbysoft",
    domain: "hotel_distribution",
    disposition: "strategic_evaluate",
    rationale: "Evaluate for direct hotel connectivity/distribution and corporate hotel workflows rather than as a generic inventory replacement.",
    architectureFit: ["supplier connectivity", "hotel content", "corporate travel", "post-booking operations"],
    prerequisites: ["commercial scope", "pilot suppliers/rate plans", "API certification", "booking and servicing evidence"],
    doesNotReplace: ["Worldway hotel ranking", "package optimization", "dynamic pricing"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://www.derbysoft.com/streamlined-connectivity/", "https://www.derbysoft.com/business-travel-solutions/"],
  },
  {
    key: "airwallex",
    domain: "payments",
    disposition: "strategic_evaluate",
    rationale: "Evaluate as a global payments/financial-infrastructure option, especially for marketplace flows, multi-currency collection and supplier payouts.",
    architectureFit: ["payment orchestration", "marketplace settlement", "multi-currency commerce"],
    prerequisites: ["commercial approval", "supported-market review", "PCI/security review", "sandbox-to-production certification"],
    doesNotReplace: ["Worldway payment policy", "booking readiness", "supplier adapters"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://www.airwallex.com/docs/developer-tools/api", "https://www.airwallex.com/docs/payments-for-platforms/overview"],
  },
  {
    key: "riskline",
    domain: "travel_risk",
    disposition: "integrate_candidate",
    rationale: "Evaluate as a dedicated travel-risk intelligence source feeding the Travel Knowledge Layer and trip/traveller safety context.",
    architectureFit: ["Travel Knowledge Layer", "destination intelligence", "pre-trip and in-trip alerts"],
    prerequisites: ["API access", "data licensing review", "freshness/SLA validation", "deterministic source attribution"],
    doesNotReplace: ["Worldway trip graph", "booking authority", "traveller memory"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://riskline.readme.io/reference/trip-ready-api", "https://riskline.readme.io/reference/alert-overview"],
  },
  {
    key: "amadeus",
    domain: "air_content",
    disposition: "strategic_evaluate",
    rationale: "Reassess after the completed architecture against existing flight suppliers, coverage, commercial terms, and production certification requirements.",
    architectureFit: ["flight content", "flight search", "hotel/transfer supplemental content"],
    prerequisites: ["commercial/API access", "coverage comparison", "normalization audit", "production booking evidence where applicable"],
    doesNotReplace: ["Worldway flight ranking", "chronological trip graph", "package optimizer"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://admin.developers.amadeus.com/self-service", "https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/"],
  },
  {
    key: "rategain",
    domain: "hotel_connectivity",
    disposition: "strategic_evaluate",
    rationale: "Evaluate Smart Distribution as an additional hotel distribution source where portfolio, economics or coverage materially complement existing hotel suppliers.",
    architectureFit: ["normalized hotel inventory", "hotel availability/pricing", "reservation management"],
    prerequisites: ["commercial/API access", "portfolio overlap analysis", "certification", "production booking/cancellation evidence"],
    doesNotReplace: ["Worldway hotel ranking", "package orchestration", "supplier certification"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://developer.rategain.com/our-products/smart-distribution/developer-guide", "https://developers-smartdistribution.rategain.com/"],
  },
  {
    key: "spotnana",
    domain: "corporate_travel",
    disposition: "watchlist",
    rationale: "Monitor as a corporate-travel platform/API ecosystem; avoid duplicating Worldway's commerce orchestration until a concrete enterprise use case is established.",
    architectureFit: ["corporate travel", "content connectivity", "managed travel"],
    prerequisites: ["specific B2B use case", "commercial/API access", "overlap assessment"],
    doesNotReplace: ["Worldway orchestration", "supplier registry", "agentic commerce controls"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://www.spotnana.com/integrations/"],
  },
  {
    key: "navan",
    domain: "corporate_travel",
    disposition: "watchlist",
    rationale: "Monitor corporate direct-connect developments and enterprise interoperability; no immediate architectural dependency.",
    architectureFit: ["corporate travel", "hotel direct connectivity"],
    prerequisites: ["specific B2B use case", "commercial/API access", "integration boundary definition"],
    doesNotReplace: ["Worldway core commerce engine", "supplier certification"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://investors.navan.com/news-releases/news-release-details/2026/"],
  },
  {
    key: "sap-concur",
    domain: "corporate_travel",
    disposition: "watchlist",
    rationale: "Evaluate only for a concrete corporate travel, expense or enterprise interoperability requirement.",
    architectureFit: ["corporate travel", "enterprise expense interoperability"],
    prerequisites: ["specific enterprise use case", "current API contract review", "security/privacy review"],
    doesNotReplace: ["Worldway package orchestration", "supplier registry", "traveller memory"],
    evidenceDate: "2026-10-03",
    officialEvidence: ["https://developer.concur.com/"],
  },
];

export function reassessmentFor(key: string): TechnologyCandidate {
  const candidate = TECHNOLOGY_REASSESSMENT.find((item) => item.key === key);
  if (!candidate) throw new Error(`Technology candidate not found: ${key}`);
  return candidate;
}

export function candidatesFor(disposition: ReassessmentDisposition): readonly TechnologyCandidate[] {
  return TECHNOLOGY_REASSESSMENT.filter((item) => item.disposition === disposition);
}
