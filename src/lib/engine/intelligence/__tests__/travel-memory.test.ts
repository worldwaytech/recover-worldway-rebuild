import { describe, expect, it } from "vitest";
import { recallTravelMemory, rememberTravelMemory } from "../travel-memory.server";

function db(consented = true) {
  const rows: any[] = [];
  return {
    rows,
    from(table: string) {
      expect(["travel_dna","travel_memory"]).toContain(table);
      return {
        select() {
          return {
            eq(_k: string, _v: unknown) {
              return {
                maybeSingle: async () => table === "travel_dna" ? { data: { consent_preferences: consented, consent_history: consented } } : { data: null },
                order() {
                  return { limit: async () => ({ data: rows, error: null }) };
                },
              };
            },
          };
        },
        upsert(value: any) {
          rows.push(value);
          return { select: () => ({ single: async () => ({ data: value, error: null }) }) };
        },
      };
    },
  };
}

describe("Worldway travel memory", () => {
  it("requires consent", async () => {
    await expect(rememberTravelMemory(db(false) as any, "u", {
      kind: "explicit", key: "pace", value: { value: "relaxed" }, source: "user", consentScope: "preferences",
    })).rejects.toThrow("memory_consent_required");
  });

  it("preserves provenance and confidence", async () => {
    const d = db(true);
    const row = await rememberTravelMemory(d as any, "u", {
      kind: "inferred", key: "prefers_slow_travel", value: { value: true },
      confidence: 0.72, source: "system_inference", sourceRef: "journey:123", consentScope: "history",
    });
    expect(row.confidence).toBe(0.72);
    expect(row.source_ref).toBe("journey:123");
  });

  it("blocks sensitive memory content", async () => {
    await expect(rememberTravelMemory(db(true) as any, "u", {
      kind: "explicit", key: "payment_card", value: { number: "1234" }, source: "user", consentScope: "preferences",
    })).rejects.toThrow("memory_contains_disallowed_sensitive_data");
  });
});
