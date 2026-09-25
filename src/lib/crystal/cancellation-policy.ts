import type { CrystalPenaltyBand } from "./types";

/** Bumped only if the wording/structure of the policy display changes. */
export const CRYSTAL_POLICY_FORMAT = "crystal-cxl-v1";

export interface PolicyWindow {
  daysFrom: number;
  daysTo: number;
  /** Calendar window (ISO dates) relative to departure, when known. */
  startDate?: string;
  endDate?: string;
  penaltyLabel: string;
  hasPenalty: boolean;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function norm(bands: CrystalPenaltyBand[] | null | undefined): CrystalPenaltyBand[] {
  return [...(bands ?? [])]
    .map((b) => ({
      daysFrom: Math.max(b.daysFrom, b.daysTo),
      daysTo: Math.min(b.daysFrom, b.daysTo),
      amountPercent: b.amountPercent,
      fixedAmount: b.fixedAmount,
    }))
    .sort((a, b) => b.daysFrom - a.daysFrom);
}

/** Stable version id for the exact terms shown (voyage + fare + bands). */
export function policyVersion(
  voyageNumber: string,
  fareCode: string | null | undefined,
  bands: CrystalPenaltyBand[] | null | undefined,
): string {
  const payload = JSON.stringify({ v: voyageNumber, f: fareCode ?? "", b: norm(bands) });
  return `${CRYSTAL_POLICY_FORMAT}:${fnv(payload)}`;
}

function shift(date: string, days: number): string | undefined {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t - days * 864e5).toISOString().slice(0, 10);
}

export function policyWindows(
  bands: CrystalPenaltyBand[] | null | undefined,
  departureDate?: string | null,
  currency = "USD",
): PolicyWindow[] {
  return norm(bands).map((b) => {
    const pct = b.amountPercent ?? 0;
    const fixed = b.fixedAmount ?? 0;
    const hasPenalty = pct > 0 || fixed > 0;
    const penaltyLabel =
      pct > 0
        ? `${pct}% of fare`
        : fixed > 0
          ? `${currency} ${fixed.toLocaleString()} per guest`
          : "No cancellation fee";
    return {
      daysFrom: b.daysFrom,
      daysTo: b.daysTo,
      startDate: departureDate ? shift(departureDate, b.daysFrom) : undefined,
      endDate: departureDate ? shift(departureDate, b.daysTo) : undefined,
      penaltyLabel,
      hasPenalty,
    };
  });
}

/** Days until the first fee-bearing window starts (e.g. 120). */
export function firstPenaltyDay(bands: CrystalPenaltyBand[] | null | undefined): number | null {
  const w = norm(bands).find((b) => (b.amountPercent ?? 0) > 0 || (b.fixedAmount ?? 0) > 0);
  return w ? w.daysFrom : null;
}

/** Days before departure when percentage-of-fare penalties begin (e.g. 120). */
export function firstPercentPenaltyDay(bands: CrystalPenaltyBand[] | null | undefined): number | null {
  const w = norm(bands).find((b) => (b.amountPercent ?? 0) > 0);
  return w ? w.daysFrom : null;
}
