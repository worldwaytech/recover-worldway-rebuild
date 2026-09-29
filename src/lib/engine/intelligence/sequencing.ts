// Intelligent experience sequencing. Only orders supplier-provided slots;
// never invents times. Pure.
import type { NormalizedComponent } from "../types";
import type { TravelDNA } from "./dna";
import { permittedDNA } from "./dna";

export interface SequencingIssue { componentId: string; message: string }

const ms = (s: string) => Date.parse(s);

/**
 * Choose, per activity, the best supplier slot: after arrival + rest, within
 * the stay, not overlapping other chosen activities, respecting pace limits.
 */
export function sequenceActivities(
  arrival: NormalizedComponent,
  stay: NormalizedComponent,
  options: { activityKey: string; slots: NormalizedComponent[] }[],
  dna: TravelDNA,
): { chosen: NormalizedComponent[]; unplaced: SequencingIssue[] } {
  const d = permittedDNA(dna);
  const longHaul = ms(arrival.end.at) - ms(arrival.start.at) > 6 * 3600_000;
  const rest = (d.arrivalRestHours ?? (longHaul ? 4 : 1)) * 3600_000;
  const perDay = d.pace === "relaxed" ? 1 : d.pace === "active" ? 3 : 2;
  const earliest = Math.max(ms(arrival.end.at) + rest, ms(stay.start.at));
  const chosen: NormalizedComponent[] = [];
  const unplaced: SequencingIssue[] = [];
  const day = (c: NormalizedComponent) => new Intl.DateTimeFormat("en-CA", { timeZone: c.start.timezone }).format(new Date(c.start.at));
  for (const o of options) {
    const slot = [...o.slots]
      .sort((a, b) => ms(a.start.at) - ms(b.start.at))
      .find((s) =>
        ms(s.start.at) >= earliest &&
        ms(s.end.at) <= ms(stay.end.at) &&
        !chosen.some((c) => ms(s.start.at) < ms(c.end.at) && ms(c.start.at) < ms(s.end.at)) &&
        chosen.filter((c) => day(c) === day(s)).length < perDay,
      );
    if (slot) chosen.push(slot);
    else unplaced.push({ componentId: o.activityKey, message: "No supplier slot fits after arrival/rest within the stay." });
  }
  return { chosen: chosen.sort((a, b) => ms(a.start.at) - ms(b.start.at)), unplaced };
}
