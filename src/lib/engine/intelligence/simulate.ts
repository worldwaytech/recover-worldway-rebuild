// What-If / change simulation + alternatives + human approval. Pure.
// Loop: change → dependencies → rerank → reprice → revalidate → re-audit → approval.
import { normalizeOffers, type CanonicalOffer } from "../normalize";
import { isMaterialChange, runPackagePipeline, type PipelineInput, type PipelinePackage } from "../package";
import { buildDependencies, downstreamOf, type JourneyContext } from "./journey";

export type Change =
  | { type: "replace"; externalId: string; with: CanonicalOffer }
  | { type: "remove"; externalId: string }
  | { type: "add"; offer: CanonicalOffer };

export interface Simulation {
  change: Change;
  before: PipelinePackage;
  after: PipelinePackage;
  impacted: string[];
  material: string[];
  priceDelta: number | null;
  newIssues: string[];
  requiresApproval: boolean;
  bookableAfter: boolean;
}

function apply(offers: CanonicalOffer[], c: Change): CanonicalOffer[] {
  if (c.type === "add") return [...offers, c.offer];
  if (!offers.some((o) => o.externalId === c.externalId)) throw new Error("Component not in journey");
  if (c.type === "remove") return offers.filter((o) => o.externalId !== c.externalId);
  return offers.map((o) => (o.externalId === c.externalId ? c.with : o));
}

const idOf = (offers: CanonicalOffer[], ext: string) => normalizeOffers(offers.filter((o) => o.externalId === ext)).components[0]?.id;

export function simulate(ctx: JourneyContext, change: Change, input: Omit<PipelineInput, "candidates">): Simulation {
  const [before] = runPackagePipeline({ ...input, candidates: [{ id: `${ctx.journeyId}@v${ctx.version}`, offers: ctx.offers }] });
  const nextOffers = apply(ctx.offers, change);
  const [after] = runPackagePipeline({ ...input, candidates: [{ id: `${ctx.journeyId}@v${ctx.version + 1}`, offers: nextOffers }] });
  const deps = buildDependencies(before!.graph);
  const targetExt = change.type === "add" ? null : change.externalId;
  const targetId = targetExt ? idOf(ctx.offers, targetExt) : undefined;
  const impacted = targetId ? downstreamOf(targetId, deps) : [];
  let material: string[] = [];
  if (change.type === "replace") {
    const pair = normalizeOffers([ctx.offers.find((o) => o.externalId === change.externalId)!, change.with]).components;
    material = pair.length === 2 ? isMaterialChange(pair[0]!, pair[1]!) : ["unverifiable"];
  } else material = [change.type === "remove" ? "component removed" : "component added"];
  const key = (i: { code: string; message: string }) => `${i.code}:${i.message}`;
  const had = new Set(before!.issues.map(key));
  const newIssues = after!.issues.filter((i) => !had.has(key(i))).map((i) => i.message);
  const priceDelta = before!.pricing && after!.pricing ? Math.round((after!.pricing.total - before!.pricing.total) * 100) / 100 : null;
  return {
    change, before: before!, after: after!, impacted, material, priceDelta, newIssues,
    requiresApproval: material.length > 0 || impacted.length > 0 || (priceDelta ?? 1) !== 0,
    bookableAfter: after!.bookable,
  };
}

/** Rank supplier-sourced alternatives for one component by full re-simulation. */
export function rankAlternatives(ctx: JourneyContext, externalId: string, alternatives: CanonicalOffer[], input: Omit<PipelineInput, "candidates">) {
  return alternatives
    .map((alt) => simulate(ctx, { type: "replace", externalId, with: alt }, input))
    .sort((a, b) =>
      Number(b.bookableAfter) - Number(a.bookableAfter) ||
      a.material.length - b.material.length ||
      b.after.score - a.after.score ||
      (a.priceDelta ?? Infinity) - (b.priceDelta ?? Infinity));
}

export type ApprovalDecision = { approvedBy: string; at: string } | null;

/** Human approval gate: material/downstream/price changes need an explicit approval. */
export function commitChange(ctx: JourneyContext, sim: Simulation, approval: ApprovalDecision): JourneyContext {
  if (sim.requiresApproval && !approval) throw new Error("Approval required for this change");
  if (sim.after.issues.some((i) => i.severity === "error" && i.code !== "substitution-requires-approval"))
    throw new Error("Change fails audit; cannot update journey");
  return { ...ctx, version: ctx.version + 1, offers: apply(ctx.offers, sim.change), state: ctx.state === "booked" ? "proposed" : ctx.state };
}
