// Package pipeline — pure and deterministic:
// Normalize → Trip Graph → Ranking → Package Audit → Pricing → Booking Readiness.
// No supplier knowledge; AI never supplies availability, schedules or prices.
import { buildChronologicalTripGraph, buildJourneySegments, sortChronologically } from "./chronology";
import { buildItinerary, checkTripRequirements, createTripRequirementProfile, detectOrchestrationConflicts, type TripRequirementProfile } from "./orchestration";
import { normalizeOffers, type CanonicalOffer } from "./normalize";
import { pricePackage, type FxTable, type PricingRule } from "./pricing";
import { rankPackages, type RankedPackage } from "./ranking";
import { optimizePackageSet, type RankingProfile } from "./optimization";
import type { AuditIssue, NormalizedComponent, SupplierRegistration, TripRequirements } from "./types";

export interface PackageCandidate {
  id: string;
  offers: CanonicalOffer[];
}

export interface PipelineInput {
  requirements: TripRequirements;
  candidates: PackageCandidate[];
  registry: Map<string, SupplierRegistration>;
  currency: string;
  fx: FxTable;
  ruleFor: (c: NormalizedComponent) => PricingRule | null;
  orchestration?: TripRequirementProfile;
  ranking?: RankingProfile;
  optimization?: { enabled?: boolean; limit?: number };
}

export interface PipelinePackage extends RankedPackage {
  graph: NormalizedComponent[];
  /** Explicit multi-city / multi-modal sequence derived from the canonical graph. */
  journeySegments: ReturnType<typeof buildJourneySegments>;
  /** Phase 7 optimized shortlist membership. */
  optimized: boolean;
  pricing: ReturnType<typeof pricePackage> | null;
  rejected: { externalId: string; reason: string }[];
  itinerary: ReturnType<typeof buildItinerary>;
}

function tryPrice(items: NormalizedComponent[], i: PipelineInput) {
  try {
    return { pricing: pricePackage(items, i.currency, i.fx, i.ruleFor), error: null as string | null };
  } catch (e) {
    return { pricing: null, error: e instanceof Error ? e.message : "pricing failed" };
  }
}

export function runPackagePipeline(input: PipelineInput): PipelinePackage[] {
  const built = input.candidates.map((c) => {
    const { components, rejected } = normalizeOffers(c.offers);
    const graph = sortChronologically(components);
    const chronology = buildChronologicalTripGraph(graph);
    const profile = input.orchestration ?? createTripRequirementProfile(input.requirements);
    const requirementCheck = checkTripRequirements(graph, profile);
    const orchestration = detectOrchestrationConflicts(graph, profile);
    const { pricing, error } = tryPrice(graph, input);
    return { id: c.id, graph, chronology, requirementCheck, orchestration, rejected, pricing, priceError: error };
  });
  // Only priced packages have a comparable total; unpriced sort last and are never bookable.
  const optimizationInputs = built.map((b) => ({ id: b.id, items: b.graph, total: b.pricing?.total ?? Number.MAX_SAFE_INTEGER }));
  const optimizedIds = new Set(
    input.optimization?.enabled === false
      ? optimizationInputs.map((x) => x.id)
      : optimizePackageSet(
          optimizationInputs,
          input.requirements,
          input.registry,
          input.optimization?.limit ?? 3,
          input.ranking,
        ).map((x) => x.id),
  );
  const ranked = rankPackages(
    optimizationInputs,
    input.requirements,
    input.registry,
    input.ranking,
  );
  return ranked.map((r) => {
    const b = built.find((x) => x.id === r.id)!;
    const issues: AuditIssue[] = [
      ...b.chronology.issues,
      ...b.requirementCheck.missing.map((x) => ({ code: "missing-required-product" as const, severity: "error" as const, componentIds: [], message: x.reason }) satisfies AuditIssue),
      ...b.requirementCheck.warnings.map((message) => ({ code: "document-requirement" as const, severity: "warning" as const, componentIds: [], message }) satisfies AuditIssue),
      ...b.orchestration.map((x) => ({ code: x.code, severity: x.severity, componentIds: x.componentIds, message: x.message }) satisfies AuditIssue),
      ...r.issues,
    ];
    if (!b.pricing) issues.push({ code: "price-unavailable", severity: "error", componentIds: [], message: b.priceError ?? "Price unavailable" });
    if (b.rejected.length) issues.push({ code: "price-unavailable", severity: "error", componentIds: [], message: `${b.rejected.length} supplier result(s) could not be normalised.` });
    const orchestrationErrors = b.orchestration.some((x) => x.severity === "error") || b.requirementCheck.missing.length > 0;
    const bookable = r.bookable && !orchestrationErrors && !!b.pricing && b.rejected.length === 0 && b.graph.length > 0;
    return { ...r, issues, bookable, optimized: optimizedIds.has(r.id), graph: b.graph, journeySegments: buildJourneySegments(b.graph), itinerary: buildItinerary(b.graph), pricing: b.pricing, rejected: b.rejected };
  });
}

/** Material-difference check: substitutes must match kind, place and timing, within 10% price. */
export function isMaterialChange(a: NormalizedComponent, b: NormalizedComponent): string[] {
  const d: string[] = [];
  if (a.kind !== b.kind) d.push("product type");
  if (a.start.place !== b.start.place || a.end.place !== b.end.place) d.push("location");
  const h = (x: string, y: string) => Math.abs(Date.parse(x) - Date.parse(y)) / 3600_000;
  if (h(a.start.at, b.start.at) > 2 || h(a.end.at, b.end.at) > 2) d.push("timing");
  if (a.net.currency === b.net.currency && a.net.amount > 0 && Math.abs(b.net.amount - a.net.amount) / a.net.amount > 0.1) d.push("price");
  if (a.cancellation.refundable && !b.cancellation.refundable) d.push("cancellation terms");
  return d;
}

/**
 * Failover: replace a failed component with an alternative only after the whole
 * package is re-ranked, re-priced and re-audited. Material differences are
 * flagged for customer approval and the package is not bookable until then.
 */
export function substituteAndRevalidate(
  input: PipelineInput,
  pkg: PackageCandidate,
  failedExternalId: string,
  alternative: CanonicalOffer,
): { package: PipelinePackage; material: string[] } {
  const original = pkg.offers.find((o) => o.externalId === failedExternalId);
  if (!original) throw new Error("Component not in package");
  const offers = pkg.offers.map((o) => (o.externalId === failedExternalId ? alternative : o));
  const [result] = runPackagePipeline({ ...input, candidates: [{ id: `${pkg.id}~alt`, offers }] });
  const { components } = normalizeOffers([original, alternative]);
  const material = components.length === 2 ? isMaterialChange(components[0]!, components[1]!) : ["unverifiable"];
  if (material.length) {
    result!.issues.push({ code: "substitution-requires-approval", severity: "error", componentIds: [], message: `Alternative differs in ${material.join(", ")}; customer approval required.` });
    result!.bookable = false;
  }
  return { package: result!, material };
}
