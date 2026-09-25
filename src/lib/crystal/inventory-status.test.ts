import { describe, expect, it } from "vitest";
import { classifyCrystalVoyage, customerBookabilityLabel, summariseCrystalInventory } from "./inventory-status";
import { crystalWorldCruises } from "./world-cruises";

describe("crystal inventory classification", () => {
  it("world cruises are off-API enquiry only with itineraries kept", () => {
    const wc = crystalWorldCruises();
    expect(wc.length).toBe(3);
    for (const v of wc) {
      expect(classifyCrystalVoyage(v)).toBe("off_api_enquiry");
      expect(customerBookabilityLabel(v, true)).toBe("Enquiry only");
    }
  });
  it("API voyages never claim online booking while fail-closed", () => {
    const v = { dataSource: "licensed" as const, bookingMode: "supplier" as const };
    expect(classifyCrystalVoyage(v)).toBe("api_live");
    expect(customerBookabilityLabel(v, false)).not.toMatch(/book online/);
  });
  it("169 API + 3 off-API = 172", () => {
    const api = Array.from({ length: 169 }, () => ({ dataSource: "licensed" as const, bookingMode: "supplier" as const }));
    expect(summariseCrystalInventory([...api, ...crystalWorldCruises()])).toEqual({ apiLive: 169, offApi: 3, total: 172 });
  });
});
