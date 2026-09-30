import { afterEach, describe, expect, it } from "vitest";
import { bookingBlockers } from "../capabilities";
import { SUPPLIER_CATALOG, liveStatus, registrationFor } from "../suppliers/catalog.server";
import { commercialRuleFor } from "../suppliers/commercial.server";

const prev = process.env["TRAVELSHOP_MARKUP_PERCENT"];
afterEach(() => { process.env["TRAVELSHOP_MARKUP_PERCENT"] = prev; });

describe("tour supplier in the engine", () => {
  it("is LIVE for search/availability/price but never bookable without authorisation", () => {
    const r = registrationFor("travelshop");
    expect(liveStatus(r)).toBe("LIVE");
    expect(r.kinds).toEqual(["activity"]);
    expect(bookingBlockers(r).length).toBeGreaterThan(0);
    expect(SUPPLIER_CATALOG.filter((s) => !bookingBlockers(s).length).map((s) => s.supplierKey)).toEqual(["crystal"]);
  });
  it("uses the approved 10% markup and blocks pricing when unset (never 0%)", () => {
    process.env["TRAVELSHOP_MARKUP_PERCENT"] = "10";
    expect(commercialRuleFor({ supplierKey: "travelshop" })!.markupPercent).toBe(10);
    process.env["TRAVELSHOP_MARKUP_PERCENT"] = "";
    expect(commercialRuleFor({ supplierKey: "travelshop" })).toBeNull();
  });
});
