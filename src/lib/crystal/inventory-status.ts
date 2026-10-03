import type { CrystalVoyage } from "./types";

/**
 * Inventory classification for Crystal voyages.
 * - "api_live": returned by Crystal's production feed; live fares/availability,
 *   bookable end to end once the production booking switch is authorised.
 * - "off_api_enquiry": real Crystal-published voyages (World Cruises) that the
 *   production feed does not return — enquiry only, never bookable online.
 */
export type CrystalInventoryClass = "api_live" | "off_api_enquiry";

export function classifyCrystalVoyage(v: Pick<CrystalVoyage, "dataSource" | "bookingMode">) {
  return v.dataSource === "licensed" && v.bookingMode !== "enquiry"
    ? ("api_live" as const)
    : ("off_api_enquiry" as const);
}

export const CRYSTAL_INVENTORY_LABEL: Record<CrystalInventoryClass, string> = {
  api_live: "API LIVE & BOOKABLE",
  off_api_enquiry: "OFF-API ENQUIRY ONLY",
};

/** Customer-safe status text; only claims online booking when it is actually open. */
export function customerBookabilityLabel(
  v: Pick<CrystalVoyage, "dataSource" | "bookingMode">,
  liveBookingOpen: boolean,
): string {
  if (classifyCrystalVoyage(v) === "off_api_enquiry") return "Enquiry only";
  return liveBookingOpen ? "Live availability · book online" : "Live availability · reserved by our cruise desk";
}

export function summariseCrystalInventory(voyages: Pick<CrystalVoyage, "dataSource" | "bookingMode">[]) {
  let apiLive = 0;
  let offApi = 0;
  for (const v of voyages) {
    if (classifyCrystalVoyage(v) === "api_live") apiLive++;
    else offApi++;
  }
  return { apiLive, offApi, total: apiLive + offApi };
}
