// Disruption detection + replanning. Events come only from supplier/status feeds. Pure.
import { normalizeOffers, type CanonicalOffer } from "../normalize";
import type { PipelineInput } from "../package";
import { buildDependencies, downstreamOf, type JourneyContext } from "./journey";
import { rankAlternatives } from "./simulate";
import { checkChronology } from "../chronology";

export type SupplierEvent =
  | { type: "delay"; externalId: string; newStart: string; newEnd: string; source: string }
  | { type: "cancelled"; externalId: string; source: string }
  | { type: "schedule_change"; externalId: string; newStart: string; newEnd: string; source: string };

export interface Disruption {
  event: SupplierEvent;
  componentId: string;
  affected: string[];
  broken: string[];
  severity: "info" | "action_required";
}

export function detectDisruptions(ctx: JourneyContext, events: SupplierEvent[]): Disruption[] {
  const { components } = normalizeOffers(ctx.offers);
  const deps = buildDependencies(components);
  return events.flatMap((ev) => {
    const target = components.find((c) => c.externalId === ev.externalId);
    if (!target) return [];
    const affected = downstreamOf(target.id, deps);
    let broken: string[] = [];
    if (ev.type === "cancelled") broken = [target.id, ...affected];
    else {
      const moved = components.map((c) => (c.id === target.id ? { ...c, start: { ...c.start, at: ev.newStart }, end: { ...c.end, at: ev.newEnd } } : c));
      broken = [...new Set(checkChronology(moved).filter((i) => i.severity === "error").flatMap((i) => i.componentIds))];
    }
    return [{ event: ev, componentId: target.id, affected, broken, severity: broken.length ? "action_required" : "info" }];
  });
}

/** Replan a disrupted component using real supplier alternatives only. Never auto-commits. */
export function replan(ctx: JourneyContext, d: Disruption, alternatives: CanonicalOffer[], input: Omit<PipelineInput, "candidates">) {
  const ext = d.event.externalId;
  const options = rankAlternatives(ctx, ext, alternatives, input);
  return { disruption: d, options, recommended: options.find((o) => o.bookableAfter) ?? null, requiresApproval: true as const };
}
