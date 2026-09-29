// Post-booking journey intelligence: upcoming checkpoints + readiness. Pure.
import { normalizeOffers } from "../normalize";
import type { JourneyContext } from "./journey";

export interface Checkpoint { componentId: string; at: string; kind: string; action: string }

export function upcomingCheckpoints(ctx: JourneyContext, now: string, horizonHours = 72): Checkpoint[] {
  const t = Date.parse(now);
  const { components } = normalizeOffers(ctx.offers);
  return components
    .filter((c) => Date.parse(c.start.at) > t && Date.parse(c.start.at) - t <= horizonHours * 3600_000)
    .sort((a, b) => Date.parse(a.start.at) - Date.parse(b.start.at))
    .map((c) => ({
      componentId: c.id, at: c.start.at, kind: c.kind,
      action: c.kind === "flight" ? "Reconfirm schedule with supplier" : c.kind === "stay" ? "Reconfirm check-in" : "Reconfirm start time",
    }));
}

/** Free-cancellation deadlines still ahead — useful before accepting changes. */
export function cancellationDeadlines(ctx: JourneyContext, now: string) {
  const t = Date.parse(now);
  return normalizeOffers(ctx.offers).components
    .filter((c) => c.cancellation.freeUntil && Date.parse(c.cancellation.freeUntil) > t)
    .map((c) => ({ componentId: c.id, freeUntil: c.cancellation.freeUntil! }));
}
