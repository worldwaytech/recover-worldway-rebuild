/**
 * Viator age-band contract (pure, client-safe).
 *
 * Viator products declare their own bookable age bands in
 * `pricingInfo.ageBands` (ADULT / SENIOR / YOUTH / CHILD / INFANT) together with
 * the real age range and per-band traveller limits. We must offer exactly the
 * bands the supplier published — never a hard-coded adult/child pair.
 */

export const VIATOR_AGE_BANDS = ["ADULT", "SENIOR", "YOUTH", "CHILD", "INFANT"] as const;

export type ViatorAgeBand = (typeof VIATOR_AGE_BANDS)[number];

export type AgeBandRule = {
  ageBand: ViatorAgeBand;
  startAge: number | null;
  endAge: number | null;
  minTravelersPerBooking: number | null;
  maxTravelersPerBooking: number | null;
};

export type PaxMixEntry = { ageBand: ViatorAgeBand; count: number };

const BAND_TITLES: Record<ViatorAgeBand, string> = {
  ADULT: "Adult",
  SENIOR: "Senior",
  YOUTH: "Youth",
  CHILD: "Child",
  INFANT: "Infant",
};

export function isViatorAgeBand(value: string): value is ViatorAgeBand {
  return (VIATOR_AGE_BANDS as readonly string[]).includes(value);
}

/** "Adult (18–64)" — age range only when the supplier published one. */
export function ageBandLabel(rule: Pick<AgeBandRule, "ageBand" | "startAge" | "endAge">): string {
  const title = BAND_TITLES[rule.ageBand] ?? rule.ageBand;
  const { startAge, endAge } = rule;
  if (startAge == null && endAge == null) return title;
  if (startAge != null && endAge != null) {
    return startAge === endAge ? `${title} (age ${startAge})` : `${title} (${startAge}–${endAge})`;
  }
  if (startAge != null) return `${title} (${startAge}+)`;
  return `${title} (up to ${endAge})`;
}

/** Bands ordered the way travellers expect to see them. */
export function sortAgeBands(rules: readonly AgeBandRule[]): AgeBandRule[] {
  const order = new Map(VIATOR_AGE_BANDS.map((b, i) => [b, i] as const));
  return rules
    .slice()
    .sort((a, b) => (order.get(a.ageBand) ?? 99) - (order.get(b.ageBand) ?? 99));
}

export type BookingLimits = {
  minTravelersPerBooking?: number | null;
  maxTravelersPerBooking?: number | null;
  requiresAdultForBooking?: boolean;
};

export type PaxMixValidation = { ok: true; paxMix: PaxMixEntry[] } | { ok: false; reason: string };

/**
 * Validates a requested pax mix against the product's published age bands.
 * Rejects bands the product does not sell and per-band / per-booking limits.
 */
export function validatePaxMixAgainstBands(
  paxMix: readonly PaxMixEntry[],
  rules: readonly AgeBandRule[],
  limits: BookingLimits = {},
): PaxMixValidation {
  const cleaned = paxMix
    .map((p) => ({ ageBand: p.ageBand, count: Math.trunc(p.count) }))
    .filter((p) => p.count > 0);

  const total = cleaned.reduce((sum, p) => sum + p.count, 0);
  if (total < 1) return { ok: false, reason: "Select at least one traveller." };

  if (rules.length) {
    const byBand = new Map(rules.map((r) => [r.ageBand, r] as const));
    for (const entry of cleaned) {
      const rule = byBand.get(entry.ageBand);
      if (!rule) {
        return {
          ok: false,
          reason: `This experience does not accept ${BAND_TITLES[entry.ageBand].toLowerCase()} travellers.`,
        };
      }
      if (rule.maxTravelersPerBooking != null && entry.count > rule.maxTravelersPerBooking) {
        return {
          ok: false,
          reason: `Maximum ${rule.maxTravelersPerBooking} ${BAND_TITLES[entry.ageBand].toLowerCase()} travellers per booking.`,
        };
      }
      if (rule.minTravelersPerBooking != null && entry.count < rule.minTravelersPerBooking) {
        return {
          ok: false,
          reason: `Minimum ${rule.minTravelersPerBooking} ${BAND_TITLES[entry.ageBand].toLowerCase()} travellers per booking.`,
        };
      }
    }
  }

  const min = limits.minTravelersPerBooking ?? null;
  const max = limits.maxTravelersPerBooking ?? null;
  if (min != null && total < min) {
    return { ok: false, reason: `This experience requires at least ${min} travellers.` };
  }
  if (max != null && total > max) {
    return { ok: false, reason: `This experience accepts a maximum of ${max} travellers.` };
  }

  const requiresAdult = limits.requiresAdultForBooking ?? true;
  if (requiresAdult) {
    const sellsAdultBand =
      !rules.length || rules.some((r) => r.ageBand === "ADULT" || r.ageBand === "SENIOR");
    const hasAdult = cleaned.some((p) => p.ageBand === "ADULT" || p.ageBand === "SENIOR");
    if (sellsAdultBand && !hasAdult) {
      return { ok: false, reason: "At least one adult or senior traveller is required." };
    }
  }

  return { ok: true, paxMix: cleaned };
}
