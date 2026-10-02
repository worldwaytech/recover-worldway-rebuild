import { describe, expect, it } from "vitest";
import { recallTravelMemory, rememberTravelMemory } from "../travel-memory.server";

function db(consent: { preferences: boolean; history: boolean } = { preferences: true, history: true }) {
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
                maybeSingle: async () => table === "travel_dna"
                  ? { data: { consent_preferences: consent.preferences, consent_history: consent.history } }
                  : { data: null },
                order() {
                  return {
                    limit: async () => ({ data: rows, error: null }),
                  };
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
    await expect(rememberTravelMemory(db({ preferences: false, history: true }) as any, "u", {
      kind: "explicit", key: "pace", value: { value: "relaxed" }, source: "user", consentScope: "preferences",
    })).rejects.toThrow("memory_consent_required");
  });

  it("preserves provenance and confidence", async () => {
    const d = db();
    const row = await rememberTravelMemory(d as any, "u", {
      kind: "inferred", key: "prefers_slow_travel", value: { value: true },
      confidence: 0.72, source: "system_inference", sourceRef: "journey:123", consentScope: "history",
    });
    expect(row.confidence).toBe(0.72);
    expect(row.source_ref).toBe("journey:123");
  });

  it("blocks sensitive memory content", async () => {
    await expect(rememberTravelMemory(db(), "u", {
      kind: "explicit", key: "payment_card", value: { number: "1234" }, source: "user", consentScope: "preferences",
    })).rejects.toThrow("memory_contains_disallowed_sensitive_data");
  });

  it("does not recall memories after their consent scope is revoked", async () => {
    const d = db({ preferences: false, history: true });
    d.rows.push({
      id: "m1",
      memory_kind: "explicit",
      memory_key: "pace",
      value: { value: "relaxed" },
      confidence: 1,
      source: "user",
      source_ref: null,
      consent_scope: "preferences",
      expires_at: null,
    });
    d.rows.push({
      id: "m2",
      memory_kind: "journey",
      memory_key: "istanbul_trip",
      value: { value: true },
      confidence: 1,
      source: "booking",
      source_ref: "booking:1",
      consent_scope: "history",
      expires_at: null,
    });

    const memories = await recallTravelMemory(d as any, "u");
    expect(memories.map((m) => m.id)).toEqual(["m2"]);
  });
});
