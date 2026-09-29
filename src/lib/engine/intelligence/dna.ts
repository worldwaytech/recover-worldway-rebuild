// Customer Travel DNA — permitted memory only. Pure.
// Signals are used only when the customer consented to that category.
import type { ScoreFactor } from "../ranking";

export type DnaConsent = { preferences: boolean; history: boolean };

export interface TravelDNA {
  consent: DnaConsent;
  pace?: "relaxed" | "balanced" | "active";
  luxuryLevel?: 1 | 2 | 3 | 4 | 5;
  interests: string[];
  avoid: string[];
  /** Hours of rest wanted after long-haul arrival before activities. */
  arrivalRestHours?: number;
  prefersRefundable?: boolean;
  /** Derived from past bookings — only when consent.history. */
  pastKinds?: Record<string, number>;
}

export const EMPTY_DNA: TravelDNA = { consent: { preferences: false, history: false }, interests: [], avoid: [] };

/** Strip anything the customer hasn't permitted. */
export function permittedDNA(d: TravelDNA): TravelDNA {
  const out: TravelDNA = { consent: d.consent, interests: [], avoid: [] };
  if (d.consent.preferences) Object.assign(out, { pace: d.pace, luxuryLevel: d.luxuryLevel, interests: d.interests, avoid: d.avoid, arrivalRestHours: d.arrivalRestHours, prefersRefundable: d.prefersRefundable });
  if (d.consent.history) out.pastKinds = d.pastKinds;
  return out;
}

/**
 * Personalise ranking weights (never prices or availability). Weights are
 * re-normalised so feasibility always stays the dominant factor.
 */
export function personaliseFactors(factors: ScoreFactor[], dna: TravelDNA): ScoreFactor[] {
  const d = permittedDNA(dna);
  const w = factors.map((f) => {
    let weight = f.weight;
    if (f.factor === "Cancellation flexibility" && d.prefersRefundable) weight *= 2;
    if (f.factor === "Quality / luxury fit" && (d.luxuryLevel ?? 0) >= 4) weight *= 1.5;
    return { ...f, weight };
  });
  const feas = w.find((f) => f.factor === "Itinerary feasibility");
  const rest = w.filter((f) => f !== feas);
  const restSum = rest.reduce((s, f) => s + f.weight, 0) || 1;
  const feasW = feas ? Math.max(feas.weight, 0.3) : 0;
  return w.map((f) => (f === feas ? { ...f, weight: feasW } : { ...f, weight: (f.weight / restSum) * (1 - feasW) }));
}

export const scoreOf = (fs: ScoreFactor[]) => Math.round(fs.reduce((s, f) => s + f.weight * f.value, 0) * 1000) / 10;
