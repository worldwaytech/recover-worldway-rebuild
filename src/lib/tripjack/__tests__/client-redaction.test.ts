import { describe, expect, it } from "vitest";
import { redact, stripAgentFields } from "../client.server";

describe("TripJack credential and agent redaction", () => {
  it("redacts agent identity recursively before evidence persistence", () => {
    const result = stripAgentFields({
      agentId: "413369",
      nested: {
        agentEmail: "worldwaytravelsgroup@gmail.com",
        items: [{ agentPhone: "9356355500" }],
      },
    });

    expect(result).toEqual({
      agentId: "[redacted]",
      nested: {
        agentEmail: "[redacted]",
        items: [{ agentPhone: "[redacted]" }],
      },
    });
    expect(JSON.stringify(result)).not.toContain("413369");
    expect(JSON.stringify(result)).not.toContain("worldwaytravelsgroup@gmail.com");
    expect(JSON.stringify(result)).not.toContain("9356355500");
  });

  it("redacts supplier response PII without altering unrelated fields", () => {
    expect(redact({
      agentId: "413369",
      customer: { email: "customer@example.com", phone: "9999999999" },
      bookingId: "TJS123456",
      status: "SUCCESS",
    })).toEqual({
      agentId: "[redacted]",
      customer: { email: "[redacted]", phone: "[redacted]" },
      bookingId: "TJS123456",
      status: "SUCCESS",
    });
  });
});
