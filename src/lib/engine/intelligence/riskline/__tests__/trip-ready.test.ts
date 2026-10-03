import { describe, expect, it } from "vitest";
import { risklineCredentialStatus } from "../client.server";
import { risklineToKnowledgeEvidence } from "../trip-ready";

describe("Riskline TripReady foundation", () => {
  it("fails closed when the token is absent", () => {
    const token = process.env.RISKLINE_API_TOKEN;
    delete process.env.RISKLINE_API_TOKEN;
    expect(risklineCredentialStatus().configured).toBe(false);
    if (token === undefined) delete process.env.RISKLINE_API_TOKEN;
    else process.env.RISKLINE_API_TOKEN = token;
  });

  it("maps TripReady attributes to evidence without granting booking authority", () => {
    const rows = risklineToKnowledgeEvidence({
      data: { id: "trip-1", attributes: { safety: "moderate", entry: "visa-required" } },
    }, "FR", "2026-10-03T00:00:00.000Z");

    expect(rows).toHaveLength(2);
    expect(rows[0]?.subject).toBe("FR");
    expect(rows[0]?.predicate).toBe("riskline.safety");
    expect(rows[0]?.sourceRef).toBe("riskline:trip-1");
    expect(rows[0]?.confidence).toBe(0.8);
  });

  it("returns no evidence for an empty response", () => {
    expect(risklineToKnowledgeEvidence({}, "FR", new Date().toISOString())).toEqual([]);
  });
});
