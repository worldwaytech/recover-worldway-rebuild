// Pure date/accommodation rules for multi-day tours inside FIT trip plans.
// All dates are LOCAL destination dates (YYYY-MM-DD) derived from the actual
// flight arrival instant + destination time zone — never the departure date.

const ACCOMMODATION = /accommodation|hotel|overnight|lodg|guest ?house|camp(ing|site)?\b|night(s)? stay/i;
const NOT_INCLUDED = /not included|excluded|own expense/i;

/** True when a multi-day tour's own inclusions already contain accommodation. */
export function tourIncludesAccommodation(inclusions: unknown, durationDays: number | null | undefined): boolean {
  if (!durationDays || durationDays < 2 || !Array.isArray(inclusions)) return false;
  return inclusions.some((i) => typeof i === "string" && ACCOMMODATION.test(i) && !NOT_INCLUDED.test(i));
}

export interface StayWindow { checkin: string; checkout: string }

export interface TourStayPlan {
  /** Nights the tour itself covers (never booked again as a hotel). */
  tourNights: StayWindow | null;
  /** Optional hotel before the tour (arrival → tour start). Never auto-added. */
  optionalPre: StayWindow | null;
  /** Optional hotel after the tour (tour end → onward departure). Never auto-added. */
  optionalPost: StayWindow | null;
}

/**
 * Stay windows around a multi-day tour. `arrivalDate` is the local date of the
 * actual flight arrival; `departureDate` the local date of the onward flight.
 */
export function stayPlanAroundTour(p: { arrivalDate: string; departureDate: string; tourStart: string; tourEnd: string; accommodationIncluded: boolean }): TourStayPlan {
  const { arrivalDate: a, departureDate: d, tourStart: s, tourEnd: e } = p;
  if (!p.accommodationIncluded || e <= s) return { tourNights: null, optionalPre: null, optionalPost: null };
  return {
    tourNights: { checkin: s, checkout: e },
    optionalPre: s > a ? { checkin: a, checkout: s } : null,
    optionalPost: d > e ? { checkin: e, checkout: d } : null,
  };
}

/** A tour may only start on/after actual arrival and must end by onward departure. */
export function tourFitsTrip(tourStart: string, tourEnd: string, arrivalDate: string, departureDate: string) {
  return tourStart >= arrivalDate && (tourEnd || tourStart) <= departureDate;
}

/** Hotel windows for the core FIT plan with any tour-covered nights removed (no duplicate accommodation). */
export function hotelWindowsExcluding(stay: StayWindow, covered: StayWindow | null): StayWindow[] {
  if (!covered || covered.checkout <= stay.checkin || covered.checkin >= stay.checkout) return [stay];
  const out: StayWindow[] = [];
  if (covered.checkin > stay.checkin) out.push({ checkin: stay.checkin, checkout: covered.checkin });
  if (covered.checkout < stay.checkout) out.push({ checkin: covered.checkout, checkout: stay.checkout });
  return out;
}
