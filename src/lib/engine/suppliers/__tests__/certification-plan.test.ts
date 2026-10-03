import { describe, expect, it } from "vitest";
import { SUPPLIER_CERTIFICATION_PLAN, certificationPlanFor } from "../certification-plan";

describe("Supplier certification plan", () => {
  it("captures every supplier requiring a post-phase16 action", () => {
    expect(SUPPLIER_CERTIFICATION_PLAN.map((item) => item.supplierKey)).toEqual([
      "travelshop", "ratehawk", "gadventures", "hbx-hotels", "hbx-transfers",
      "viator-affiliate", "up17", "airiq", "tripjack-cabs", "private-aviation",
      "skyaccess", "amadeus",
    ]);
  });

  it("fails closed for unknown suppliers", () => {
    expect(() => certificationPlanFor("unknown")).toThrow("Certification plan not found");
  });

  it("never treats a plan as certification evidence", () => {
    for (const item of SUPPLIER_CERTIFICATION_PLAN) {
      expect(item.requiredEvidence.length).toBeGreaterThan(0);
      expect(item.promotionBlocker.length).toBeGreaterThan(0);
    }
  });
});
