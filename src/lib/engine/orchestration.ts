// Phase 6 — Intelligent Package & Itinerary Orchestration.
// Pure, deterministic orchestration over already-normalized/live-sourced components.
// This layer decides whether a collection of real components satisfies the trip plan;
// it never invents inventory, schedules, prices, visas, or insurance coverage.

import type { ComponentKind, NormalizedComponent, TripRequirements } from "./types";

export type RequirementStatus = "required" | "preferred" | "optional" | "not-requested";

export interface TripRequirementProfile {
  trip: TripRequirements;
  requiredKinds: ComponentKind[];
  preferredKinds: ComponentKind[];
  optionalKinds: ComponentKind[];
  insurance: RequirementStatus;
  visa: RequirementStatus;
  visaEvidence?: string;
}

export interface RequirementCheck {
  satisfied: boolean;
  missing: { kind: ComponentKind; reason: string }[];
  preferredMissing: ComponentKind[];
  warnings: string[];
}

export interface OrchestrationConflict {
  code:
    | "duplicate-stay"
    | "activity-outside-stay"
    | "component-outside-trip"
    | "destination-coverage"
    | "missing-required-product"
    | "document-requirement";
  severity: "error" | "warning";
  componentIds: string[];
  message: string;
}

export interface ItineraryEntry {
  componentId: string;
  kind: ComponentKind;
  title: string;
  start: NormalizedComponent["start"];
  end: NormalizedComponent["end"];
  supplierKey: string;
}

export interface ItineraryDay {
  localDate: string;
  entries: ItineraryEntry[];
}

/** Build an explicit profile without guessing requirements not supplied by the traveller. */
export function createTripRequirementProfile(
  trip: TripRequirements,
  options: Partial<Pick<TripRequirementProfile, "requiredKinds" | "preferredKinds" | "optionalKinds" | "insurance" | "visa" | "visaEvidence">> = {},
): TripRequirementProfile {
  return {
    trip,
    requiredKinds: [...new Set(options.requiredKinds ?? [])],
    preferredKinds: [...new Set(options.preferredKinds ?? [])],
    optionalKinds: [...new Set(options.optionalKinds ?? [])],
    insurance: options.insurance ?? "not-requested",
    visa: options.visa ?? "not-requested",
    visaEvidence: options.visaEvidence,
  };
}

/** Apply bounded preference hints without changing hard requirements or trip facts. */
export function applyOrchestrationPreferences(
  profile: TripRequirementProfile,
  preferences: Pick<TripRequirementProfile, "preferredKinds">,
): TripRequirementProfile {
  return {
    ...profile,
    preferredKinds: [...new Set([...profile.preferredKinds, ...preferences.preferredKinds])],
  };
}

function localDate(at: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function destinationToken(place: string): string {
  return place.trim().toUpperCase();
}

function isMoving(c: NormalizedComponent): boolean {
  return ["flight", "rail", "cruise", "aviation", "transfer"].includes(c.kind);
}

/**
 * Product coverage is explicit. Transfers and insurance are not silently required
 * because supplier availability/certification may be absent; they become requirements
 * only when the customer or upstream policy explicitly requests them.
 */
export function checkTripRequirements(
  items: NormalizedComponent[],
  profile: TripRequirementProfile,
): RequirementCheck {
  const present = new Set(items.map((x) => x.kind));
  const missing = profile.requiredKinds
    .filter((kind) => !present.has(kind))
    .map((kind) => ({ kind, reason: `Required ${kind} component is missing.` }));
  const preferredMissing = profile.preferredKinds.filter((kind) => !present.has(kind));
  const warnings: string[] = [];

  if (profile.insurance === "required" && !present.has("insurance") && !missing.some((x) => x.kind === "insurance"))
    missing.push({ kind: "insurance", reason: "Travel insurance was explicitly required." });

  if (profile.visa === "required") {
    warnings.push(profile.visaEvidence
      ? `Visa/document requirement recorded: ${profile.visaEvidence}`
      : "Visa/document requirement requires verified destination/passport evidence.");
  }

  return { satisfied: missing.length === 0, missing, preferredMissing, warnings };
}

/**
 * Detect cross-product conflicts that are not merely adjacent timestamp ordering.
 * Every check uses only canonical component facts.
 */
export function detectOrchestrationConflicts(
  items: NormalizedComponent[],
  profile: TripRequirementProfile,
): OrchestrationConflict[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.start.at) - Date.parse(b.start.at));
  const out: OrchestrationConflict[] = [];
  const add = (x: OrchestrationConflict) => out.push(x);

  const first = sorted[0];
  const last = sorted.at(-1);
  if (first && Date.parse(first.start.at) < Date.parse(profile.trip.departFrom + "T00:00:00Z"))
    add({ code: "component-outside-trip", severity: "error", componentIds: [first.id], message: "Package starts before the requested trip window." });
  if (last && Date.parse(last.start.at) > Date.parse(profile.trip.returnBy + "T23:59:59Z"))
    add({ code: "component-outside-trip", severity: "error", componentIds: [last.id], message: "Package extends beyond the requested return window." });

  const stays = sorted.filter((x) => x.kind === "stay");
  for (let i = 0; i < stays.length; i += 1) {
    for (let j = i + 1; j < stays.length; j += 1) {
      const a = stays[i]!, b = stays[j]!;
      if (a.start.place !== b.start.place) continue;
      if (Date.parse(a.start.at) < Date.parse(b.end.at) && Date.parse(b.start.at) < Date.parse(a.end.at))
        add({ code: "duplicate-stay", severity: "error", componentIds: [a.id, b.id], message: `Overlapping hotel stays at ${a.start.place}.` });
    }
  }

  const transports = sorted.filter(isMoving);
  for (const c of transports) {
    if (c.kind === "transfer") continue;
    const tripPlaces = profile.trip.destinations.map(destinationToken);
    if (c.start.place && c.end.place && c.kind !== "cruise" && c.kind !== "aviation") {
      const touchesRequested = tripPlaces.some((p) => destinationToken(c.start.place).includes(p) || destinationToken(c.end.place).includes(p));
      if (!touchesRequested && ![profile.trip.origin.toUpperCase(), ...tripPlaces].includes(destinationToken(c.start.place)))
        add({ code: "destination-coverage", severity: "warning", componentIds: [c.id], message: `${c.title} does not touch a requested trip destination.` });
    }
  }

  const activities = sorted.filter((x) => x.kind === "activity");
  for (const a of activities) {
    const containingStay = stays.find((s) =>
      destinationToken(s.start.place) === destinationToken(a.start.place) &&
      Date.parse(a.start.at) >= Date.parse(s.start.at) &&
      Date.parse(a.end.at) <= Date.parse(s.end.at),
    );
    if (!containingStay)
      add({ code: "activity-outside-stay", severity: "warning", componentIds: [a.id], message: `${a.title} is not contained within a matching hotel stay.` });
  }

  if (profile.insurance === "required" && !sorted.some((x) => x.kind === "insurance"))
    add({ code: "missing-required-product", severity: "error", componentIds: [], message: "Required travel insurance is missing." });

  if (profile.visa === "required" && !profile.visaEvidence)
    add({ code: "document-requirement", severity: "warning", componentIds: [], message: "Visa/document requirement requires verified traveller and destination evidence before booking." });

  return out;
}

/** Produce a day-by-day itinerary projection from actual component timestamps only. */
export function buildItinerary(items: NormalizedComponent[]): ItineraryDay[] {
  const days = new Map<string, ItineraryEntry[]>();
  for (const c of [...items].sort((a, b) => Date.parse(a.start.at) - Date.parse(b.start.at))) {
    const day = localDate(c.start.at, c.start.timezone);
    const entry: ItineraryEntry = {
      componentId: c.id,
      kind: c.kind,
      title: c.title,
      start: c.start,
      end: c.end,
      supplierKey: c.supplierKey,
    };
    const list = days.get(day) ?? [];
    list.push(entry);
    days.set(day, list);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([localDate, entries]) => ({ localDate, entries }));
}
