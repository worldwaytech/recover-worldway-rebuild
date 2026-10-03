// Chronological trip graph + feasibility checks. Pure and deterministic.
import type { AuditIssue, LocalMoment, NormalizedComponent } from "./types";

/** Local calendar date (yyyy-mm-dd) of an instant in its own timezone. */
export function localDate(m: LocalMoment): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: m.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(m.at));
  return parts; // en-CA gives yyyy-mm-dd
}

const ms = (m: LocalMoment) => new Date(m.at).getTime();

export function sortChronologically(items: NormalizedComponent[]): NormalizedComponent[] {
  return [...items].sort((a, b) => ms(a.start) - ms(b.start));
}

function haversineKm(a: LocalMoment, b: LocalMoment): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const MIN_CONNECTION_MIN = 60;
export const MIN_AIRPORT_TO_SERVICE_MIN = 90;
const GROUND_KMH = 80;

export interface ChronologicalTripGraph {
  version: 1;
  nodes: NormalizedComponent[];
  edges: Array<{ from: string; to: string; gapMinutes: number }>;
  destinationArrivalDate?: string;
  finalDepartureDate?: string;
  issues: AuditIssue[];
}

const transportKinds = new Set(["flight", "rail", "aviation", "cruise"]);

function isTransport(c: NormalizedComponent): boolean {
  return transportKinds.has(c.kind);
}

function isContainedStayPair(a: NormalizedComponent, b: NormalizedComponent): boolean {
  return a.kind === "stay" || b.kind === "stay" || a.kind === "insurance" || b.kind === "insurance";
}

/**
 * Hotel check-in must be the local arrival date of the inbound transport,
 * never the package or departure date.
 */
export function requiredCheckInDate(inbound: NormalizedComponent): string {
  return localDate(inbound.end);
}

export function checkChronology(items: NormalizedComponent[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const sorted = sortChronologically(items);

  for (const c of sorted) {
    if (!c.start.timezone || !c.end.timezone) {
      issues.push({ code: "timezone-missing", severity: "error", componentIds: [c.id], message: `${c.title} has no timezone.` });
    }
    if (ms(c.end) < ms(c.start)) {
      issues.push({ code: "time-order", severity: "error", componentIds: [c.id], message: `${c.title} ends before it starts.` });
    }
  }

  const transport = (k: string) => transportKinds.has(k);

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      // Hotel stays contain destination activities/transfers, so overlap with a stay
      // is expected. Two moving services may not overlap.
      const exclusive = (x: NormalizedComponent) => x.kind !== "stay" && x.kind !== "insurance";
      if (exclusive(a) && exclusive(b) && ms(b.start) < ms(a.end)) {
        issues.push({ code: "overlap", severity: "error", componentIds: [a.id, b.id], message: `${a.title} overlaps ${b.title}.` });
      }
    }
  }

  // Sequential transitions.
  const moving = sorted.filter((c) => c.kind !== "stay" && c.kind !== "insurance");
  for (let i = 0; i + 1 < moving.length; i++) {
    const a = moving[i]!;
    const b = moving[i + 1]!;
    const gapMin = (ms(b.start) - ms(a.end)) / 60000;
    if (a.kind === "flight" && b.kind === "flight" && a.end.place === b.start.place && gapMin >= 0 && gapMin < MIN_CONNECTION_MIN) {
      issues.push({ code: "impossible-connection", severity: "error", componentIds: [a.id, b.id], message: `Only ${Math.round(gapMin)} min to connect at ${a.end.place}.` });
    }
    if (a.end.place !== b.start.place) {
      const km = haversineKm(a.end, b.start);
      if (km != null && gapMin > 0 && km / (gapMin / 60) > GROUND_KMH && !transport(b.kind)) {
        issues.push({ code: "impossible-travel", severity: "error", componentIds: [a.id, b.id], message: `${Math.round(km)} km in ${Math.round(gapMin)} min is not feasible.` });
      }
      if (transport(a.kind) && b.kind !== "transfer" && !transport(b.kind)) {
        issues.push({ code: "missing-transfer", severity: "warning", componentIds: [a.id, b.id], message: `No transfer from ${a.end.place} to ${b.start.place}.` });
      }
    }
  }

  // Stay dates vs inbound arrival.
  for (const stay of sorted.filter((c) => c.kind === "stay")) {
    const inbound = [...sorted]
      .filter((c) => transport(c.kind) && ms(c.end) <= ms(stay.start) + 36 * 3600_000)
      .sort((x, y) => ms(y.end) - ms(x.end))[0];
    if (inbound) {
      const need = requiredCheckInDate(inbound);
      const have = localDate(stay.start);
      if (have !== need) {
        issues.push({ code: "hotel-date-mismatch", severity: "error", componentIds: [inbound.id, stay.id], message: `Check-in is ${have} but arrival is ${need}.` });
      }
    }
  }
  return issues;
}


/**
 * Build the canonical chronological graph used by downstream ranking, packaging
 * and booking-readiness layers. The graph is deterministic and uses supplier
 * instants as the source of truth.
 */
export function buildChronologicalTripGraph(items: NormalizedComponent[]): ChronologicalTripGraph {
  const nodes = sortChronologically(items);
  const issues = checkChronology(nodes);
  const edges: Array<{ from: string; to: string; gapMinutes: number }> = [];

  const moving = nodes.filter((c) => c.kind !== "stay" && c.kind !== "insurance");
  for (let i = 0; i + 1 < moving.length; i += 1) {
    const from = moving[i]!;
    const to = moving[i + 1]!;
    edges.push({
      from: from.id,
      to: to.id,
      gapMinutes: Math.round((ms(to.start) - ms(from.end)) / 60000),
    });
  }

  const firstDestinationArrival = nodes.find((c) => isTransport(c) && c.end.place !== c.start.place);
  const lastReturn = [...nodes].reverse().find((c) => isTransport(c));

  return {
    version: 1,
    nodes,
    edges,
    destinationArrivalDate: firstDestinationArrival ? requiredCheckInDate(firstDestinationArrival) : undefined,
    finalDepartureDate: lastReturn ? localDate(lastReturn.start) : undefined,
    issues,
  };
}

/** Convenience predicate for booking-readiness and package auditing. */
export function checkTripWindow(
  items: NormalizedComponent[],
  requirements: { departFrom: string; returnBy: string },
): AuditIssue[] {
  const transport = items.filter((c) => transportKinds.has(c.kind)).sort((a, b) => ms(a.start) - ms(b.start));
  if (!transport.length) return [];

  const issues: AuditIssue[] = [];
  const first = transport[0]!;
  const last = transport[transport.length - 1]!;
  const departureDate = localDate(first.start);
  const arrivalDate = localDate(last.end);

  if (departureDate < requirements.departFrom) {
    issues.push({
      code: "outside-trip-window",
      severity: "error",
      componentIds: [first.id],
      message: `${first.title} departs on ${departureDate}, before the requested trip start ${requirements.departFrom}.`,
    });
  }
  if (arrivalDate > requirements.returnBy) {
    issues.push({
      code: "outside-trip-window",
      severity: "error",
      componentIds: [last.id],
      message: `${last.title} arrives on ${arrivalDate}, after the requested trip end ${requirements.returnBy}.`,
    });
  }
  return issues;
}

export function chronologyIsValid(items: NormalizedComponent[]): boolean {
  return checkChronology(items).every((issue) => issue.severity !== "error");
}
