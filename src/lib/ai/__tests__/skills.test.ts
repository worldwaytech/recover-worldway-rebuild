import { describe, expect, it } from "vitest";
import { SPECIALIST_AGENTS, WORLDWAY_SKILLS, specialistForGoal } from "../runtime/skills";

describe("Worldway AI skills", () => {
  it("starts with read/analyze/simulate/quote risk only", () => {
    expect(WORLDWAY_SKILLS).toHaveLength(8);
    for (const skill of WORLDWAY_SKILLS) {
      expect(skill.autonomous).toBe(false);
      expect([...skill.allowedRisk].every((r) => ["READ","SEARCH","ANALYZE","SIMULATE","QUOTE"].includes(r))).toBe(true);
    }
  });

  it("routes goals to specialist configurations", () => {
    expect(specialistForGoal("find the best flights")).toEqual([SPECIALIST_AGENTS[0]]);
    expect(specialistForGoal("plan a luxury package")).toEqual([SPECIALIST_AGENTS[8], SPECIALIST_AGENTS[9]]);
  });
});
