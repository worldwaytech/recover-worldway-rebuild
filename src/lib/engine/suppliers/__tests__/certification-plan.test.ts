import { describe, expect, it } from "vitest";
import { SUPPLIER_CERTIFICATION_PLAN, certificationPlanFor } from "../certification-plan";

describe("Supplier certification plan", () => {
  it("covers every registered supplier exactly once", async () => {
    const { SUPPLIER_CATALOG } = await import("../catalog.server");
    const planKeys = new Set(SUPPLIER_CERTIFICATION_PLAN.map((item) => item.supplierKey));
    for (const supplier of SUPPLIER_CATALOG) {
      expect(planKeys.has(supplier.supplierKey)).toBe(true);
    }
  });

  it("captures every supplier requiring a post-phase16 action", () => {
    expect(SUPPLIER_CERTIFICATION_PLAN.map((item) => item.supplierKey).sort()).toEqual([
      "viator-merchant", "tripsafe", "crystal", "travelgate", "travelshop", "ratehawk", "gadventures", "hbx-hotels", "hbx-transfers",
      "ttc", "viator-affiliate", "up17", "airiq", "tripjack-cabs", "private-aviation",
      "skyaccess", "amadeus",
    ].sort());
  });



  it("does not treat TravelShop certification evidence as a customer-booking blocker", () => {
    const travelshop = certificationPlanFor("travelshop");
    expect(travelshop.currentReadiness).toBe("production");
    expect(travelshop.nextStep).toBe("maintain_current_scope");
    expect(travelshop.promotionBlocker).toContain("No customer-booking blocker");
    expect(travelshop.promotionBlocker).toContain("Paid booking evidence remains certification evidence");
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
