// Aviation provider abstraction.
//
// The UI never touches a specific data source directly. It talks to an
// `AviationProvider` implementation, so swapping in a live partner API in
// the future (e.g. Jettly, Avinode, etc.) is a matter of adding a new
// provider file and flipping `activeProvider`. No UI changes required.

import { AIRCRAFT, EMPTY_LEGS, type Aircraft, type EmptyLeg } from "./empty-legs-data";

export type EmptyLegSearch = {
  from?: string;
  to?: string;
  date?: string;
  region?: string;
  category?: string;
  passengers?: number;
  includeSold?: boolean;
};

export interface AviationProvider {
  id: string;
  label: string;
  /** Indicative catalogue only — never presented as live inventory. */
  isIndicative: boolean;
  listEmptyLegs(search?: EmptyLegSearch): Promise<EmptyLeg[]>;
  getEmptyLeg(id: string): Promise<EmptyLeg | null>;
  listAircraft(category?: string): Promise<Aircraft[]>;
  getAircraft(slug: string): Promise<Aircraft | null>;
}

// -------- Local indicative catalogue (in-repo seed data) --------
// Populated from publicly available route/aircraft information. All
// listings are subject to confirmation by the Worldway Private Aviation
// Concierge. Never marketed as live inventory.

function matches(leg: EmptyLeg, s: EmptyLegSearch): boolean {
  const ac = AIRCRAFT.find((a) => a.slug === leg.aircraftSlug);
  if (s.from && !`${leg.fromCity} ${leg.fromIata}`.toLowerCase().includes(s.from.toLowerCase()))
    return false;
  if (s.to && !`${leg.toCity} ${leg.toIata}`.toLowerCase().includes(s.to.toLowerCase()))
    return false;
  if (s.region && s.region !== "All Regions" && leg.region !== s.region) return false;
  if (s.category && s.category !== "All Aircraft" && ac?.category !== s.category) return false;
  if (s.passengers && s.passengers > leg.seats) return false;
  if (s.date) {
    const d = s.date;
    if (d < leg.departWindowStart.slice(0, 10) || d > leg.departWindowEnd.slice(0, 10))
      return false;
  }
  if (!s.includeSold && (leg.status === "Sold" || leg.status === "Expired")) return false;
  return true;
}

export const localProvider: AviationProvider = {
  id: "local-indicative",
  label: "Worldway Indicative Catalogue",
  isIndicative: true,
  async listEmptyLegs(search = {}) {
    return EMPTY_LEGS.filter((l) => matches(l, search));
  },
  async getEmptyLeg(id) {
    return EMPTY_LEGS.find((l) => l.id === id) ?? null;
  },
  async listAircraft(category) {
    if (!category || category === "All Aircraft") return AIRCRAFT;
    return AIRCRAFT.filter((a) => a.category === category);
  },
  async getAircraft(slug) {
    return AIRCRAFT.find((a) => a.slug === slug) ?? null;
  },
};

// Placeholder for future live-partner provider. When credentials become
// available, implement this against the partner API and set
// `activeProvider = jettlyProvider`. UI stays identical.
//
// export const jettlyProvider: AviationProvider = { ... };

export const activeProvider: AviationProvider = localProvider;
