import { describe, expect, it } from "vitest";
import { applyTravelMemoryDefaults, buildTravelAgentContext } from "../travel-context";

function db() {
  const memories = [{
    id: "m1",
    memory_kind: "inferred",
    memory_key: "slow_travel",
    value: { value: true },
    confidence: 0.8,
    source: "system_inference",
    source_ref: "journey:1",
    expires_at: null,
  }];
  return {
    from(table: string) {
      if (table === "travel_dna") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      consent_preferences: true,
                      consent_history: true,
                      preferences: {
                        pace: "relaxed",
                        luxuryLevel: 5,
                        prefersRefundable: true,
                      },
                    },
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "travel_memory") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit: async () => ({ data: memories, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error("unexpected_table");
    },
  };
}

describe("Worldway travel agent context", () => {
  it("loads consented DNA and memory with provenance", async () => {
    const context = await buildTravelAgentContext(db() as any, "u");
    expect(context.explicitPreferences.luxuryLevel).toBe(5);
    expect(context.memories[0]?.sourceRef).toBe("journey:1");
    expect(context.precedence).toBe("current_request_over_memory");
  });

  it("uses memory only for missing preferences", () => {
    const context = {
      explicitPreferences: { pace: "relaxed", luxuryLevel: 5 },
      memories: [],
      precedence: "current_request_over_memory" as const,
    };
    expect(applyTravelMemoryDefaults({ pace: "active" }, context).pace).toBe("active");
    expect(applyTravelMemoryDefaults({}, context).luxuryLevel).toBe(5);
  });
});
