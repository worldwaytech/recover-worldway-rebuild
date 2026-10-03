import { afterEach, describe, expect, it } from "vitest";
import { tripjackAgentCredentialStatus } from "../client.server";

const ENV = ["TRIPJACK_AGENT_ID", "TRIPJACK_AGENT_EMAIL", "TRIPJACK_AGENT_PHONE"] as const;

afterEach(() => {
  for (const key of ENV) delete process.env[key];
});

describe("TripJack agent profile configuration", () => {
  it("accepts the Worldway UAT agent profile shape", () => {
    process.env.TRIPJACK_AGENT_ID = "413369";
    process.env.TRIPJACK_AGENT_EMAIL = "worldwaytravelsgroup@gmail.com";
    process.env.TRIPJACK_AGENT_PHONE = "9356355500";

    expect(tripjackAgentCredentialStatus()).toEqual({
      configured: true,
      missing: [],
      invalid: [],
    });
  });

  it("fails closed when the agent id is missing", () => {
    process.env.TRIPJACK_AGENT_EMAIL = "worldwaytravelsgroup@gmail.com";
    process.env.TRIPJACK_AGENT_PHONE = "9356355500";

    const result = tripjackAgentCredentialStatus();
    expect(result.configured).toBe(false);
    expect(result.missing).toContain("TRIPJACK_AGENT_ID");
  });

  it("rejects malformed agent identity values", () => {
    process.env.TRIPJACK_AGENT_ID = "not-an-id";
    process.env.TRIPJACK_AGENT_EMAIL = "not-an-email";
    process.env.TRIPJACK_AGENT_PHONE = "bad";

    const result = tripjackAgentCredentialStatus();
    expect(result.configured).toBe(false);
    expect(result.invalid).toEqual([
      "TRIPJACK_AGENT_ID",
      "TRIPJACK_AGENT_EMAIL",
      "TRIPJACK_AGENT_PHONE",
    ]);
  });
});
