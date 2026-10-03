import { describe, expect, it } from "vitest";
import { SUPPLIER_CATALOG } from "../catalog.server";
import { SUPPLIER_CERTIFICATION_PLAN } from "../certification-plan";

describe("production booking integrity gate", () => {
  it("requires every certified production booking capability to carry valid production evidence", () => {
    for (const supplier of SUPPLIER_CATALOG) {
      for (const grant of supplier.grants ?? []) {
        if (
          grant.environment !== "production" ||
          grant.capability !== "book" ||
          !grant.certified
        ) {
          continue;
        }

        expect(supplier.readiness).toBe("production");
        expect(grant.evidence?.trim()).toBeTruthy();
      }
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
  it("rejects contradictory certification grants and duplicate capability/environment records", () => {
    for (const supplier of SUPPLIER_CATALOG) {
      const seen = new Set<string>();
      for (const grant of supplier.grants ?? []) {
        const key = `${grant.environment}:${grant.capability}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);

        if (grant.certified) {
          expect(grant.evidence?.trim()).toBeTruthy();
          expect(supplier.readiness).toBe(grant.environment);
        }
      }
    }
  });
});
