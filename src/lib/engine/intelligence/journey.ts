// Journey Context + State + dependency graph. Pure.
// Dependencies follow real chronology: arrival → transfer → hotel → activities → next journey.
import { sortChronologically } from "../chronology";
import type { NormalizedComponent } from "../types";
import type { CanonicalOffer } from "../normalize";

export type JourneyState = "draft" | "proposed" | "approved" | "booked" | "in_progress" | "disrupted" | "completed" | "cancelled";

const NEXT: Record<JourneyState, JourneyState[]> = {
  draft: ["proposed", "cancelled"],
  proposed: ["draft", "approved", "cancelled"],
  approved: ["proposed", "booked", "cancelled"],
  booked: ["in_progress", "disrupted", "cancelled"],
  in_progress: ["disrupted", "completed"],
  disrupted: ["proposed", "booked", "in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transition(from: JourneyState, to: JourneyState): JourneyState {
  if (!NEXT[from].includes(to)) throw new Error(`Invalid journey transition ${from} → ${to}`);
  return to;
}

export interface JourneyContext {
  journeyId: string;
  version: number;
  state: JourneyState;
  /** Supplier-sourced offers — the only authoritative inventory. */
  offers: CanonicalOffer[];
}

export interface Dependency { from: string; to: string; reason: string }

const ms = (s: string) => Date.parse(s);
const isTransport = (k: string) => ["flight", "rail", "aviation", "cruise"].includes(k);

/** Each component depends on the latest earlier component whose end it relies on. */
export function buildDependencies(items: NormalizedComponent[]): Dependency[] {
  const sorted = sortChronologically(items);
  const deps: Dependency[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i]!;
    const before = sorted.slice(0, i).filter((a) => ms(a.end.at) <= ms(b.start.at) + 36 * 3600_000);
    const transport = [...before].reverse().find((a) => isTransport(a.kind) || a.kind === "transfer");
    const stay = [...before].reverse().find((a) => a.kind === "stay" && ms(a.end.at) >= ms(b.start.at));
    if (b.kind === "stay" && transport) deps.push({ from: transport.id, to: b.id, reason: "check-in follows actual arrival" });
    else if (b.kind === "transfer" && transport) deps.push({ from: transport.id, to: b.id, reason: "transfer meets arrival" });
    else if (b.kind === "activity" && stay) deps.push({ from: stay.id, to: b.id, reason: "activity during stay" });
    else if (isTransport(b.kind) && before.length) deps.push({ from: before[before.length - 1]!.id, to: b.id, reason: "next journey departs after previous segment" });
    else if (before.length) deps.push({ from: before[before.length - 1]!.id, to: b.id, reason: "sequence" });
  }
  return deps;
}

/** Everything downstream of a component (transitive). */
export function downstreamOf(id: string, deps: Dependency[]): string[] {
  const out = new Set<string>();
  const walk = (x: string) => deps.filter((d) => d.from === x).forEach((d) => { if (!out.has(d.to)) { out.add(d.to); walk(d.to); } });
  walk(id);
  return [...out];
}
