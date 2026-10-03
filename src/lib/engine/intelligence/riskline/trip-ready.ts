import type { KnowledgeEvidence } from "@/lib/knowledge/travel-knowledge";

export interface RisklineTripReadyResource {
  type?: string;
  id?: string;
  attributes?: Record<string, unknown>;
}

export interface RisklineTripReadyDocument {
  data?: RisklineTripReadyResource | RisklineTripReadyResource[];
}

export interface TravelRiskEvidence {
  subject: string;
  predicate: string;
  value: unknown;
  confidence: number;
  observedAt: string;
  expiresAt?: string;
  source: "destination_knowledge";
  sourceRef: string;
}

export function risklineToKnowledgeEvidence(
  document: RisklineTripReadyDocument,
  destination: string,
  observedAt: string,
): TravelRiskEvidence[] {
  const rows = Array.isArray(document.data) ? document.data : document.data ? [document.data] : [];
  return rows.flatMap((row) => {
    const attrs = row.attributes ?? {};
    return Object.entries(attrs).map(([predicate, value]) => ({
      subject: destination,
      predicate: `riskline.${predicate}`,
      value,
      confidence: 0.8,
      observedAt,
      source: "destination_knowledge" as const,
      sourceRef: row.id ? `riskline:${row.id}` : "riskline:trip-ready",
    }));
  });
}
