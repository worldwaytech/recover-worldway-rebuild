import { describe, expect, it } from "vitest";
import { SUPPLIER_CATALOG } from "../catalog.server";
import { SUPPLIER_CERTIFICATION_PLAN } from "../certification-plan";

describe("production booking integrity gate", () => {
  it("never treats an uncertified production booking capability as certified", () => {
    for (const supplier of SUPPLIER_CATALOG) {
      const productionBooking = (supplier.grants ?? []).find(
        (grant) => grant.environment === "production" && grant.capability === "book",
      );

      if (!productionBooking) continue;

      expect(productionBooking.certified).toBe(true);
      expect(supplier.readiness).toBe("production");
      expect(productionBooking.evidence?.trim()).toBeTruthy();
    }
  });

  it("keeps every non-production supplier incapable of certified production booking", () => {
    for (const supplier of SUPPLIER_CATALOG) {
      if (supplier.readiness === "production") continue;

      const certifiedProductionBooking = (supplier.grants ?? []).some(
        (grant) =>
          grant.environment === "production" &&
          grant.capability === "book" &&
          grant.certified,
      );

      expect(certifiedProductionBooking).toBe(false);
    }
  });

  it("keeps every production supplier represented in the central certification plan", () => {
    const planned = new Set(SUPPLIER_CERTIFICATION_PLAN.map((item) => item.supplierKey));

    for (const supplier of SUPPLIER_CATALOG.filter((item) => item.readiness === "production")) {
      expect(planned.has(supplier.supplierKey)).toBe(true);
    }
  });
});
