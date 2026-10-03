import { describe, expect, it } from "vitest";
import {
  TECHNOLOGY_REASSESSMENT,
  candidatesFor,
  reassessmentFor,
} from "../technology-reassessment";

describe("Technology reassessment", () => {
  it("keeps the candidate set deterministic", () => {
    expect(TECHNOLOGY_REASSESSMENT.map((item) => item.key)).toEqual([
      "travelgate",
      "derbysoft",
      "airwallex",
      "riskline",
      "amadeus",
      "rategain",
      "spotnana",
      "navan",
      "sap-concur",
    ]);
  });

  it("does not promote a candidate directly to production", () => {
    for (const candidate of TECHNOLOGY_REASSESSMENT) {
      expect(["integrate_candidate", "certify_existing", "strategic_evaluate", "watchlist", "defer"])
        .toContain(candidate.disposition);
      expect(candidate.prerequisites.length).toBeGreaterThan(0);
    }
  });

  it("supports deterministic lookup by disposition", () => {
    expect(candidatesFor("integrate_candidate").map((item) => item.key))
      .toEqual(["travelgate", "riskline"]);
    expect(candidatesFor("watchlist").map((item) => item.key))
      .toEqual(["spotnana", "navan", "sap-concur"]);
  });

  it("fails closed for unknown candidates", () => {
    expect(() => reassessmentFor("unknown-vendor")).toThrow("Technology candidate not found");
  });

  it("keeps core Worldway authority outside vendor candidates", () => {
    for (const candidate of TECHNOLOGY_REASSESSMENT) {
      expect(candidate.doesNotReplace.length).toBeGreaterThan(0);
      expect(candidate.doesNotReplace.some((x) => x.includes("Worldway") || x.includes("supplier")))
        .toBe(true);
    }
  });
});
