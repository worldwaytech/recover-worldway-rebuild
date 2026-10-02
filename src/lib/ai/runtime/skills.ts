import type { TaskKind } from "../router/types";
import type { RiskLevel, ToolRegistry } from "../tools/fabric";
import type { Skill } from "./runtime";

export interface SkillDefinition {
  name: string;
  version: string;
  task: TaskKind;
  description: string;
  requiredTools: string[];
  allowedRisk: ReadonlySet<RiskLevel>;
  autonomous: false;
}

const SAFE_SKILL_RISKS: ReadonlySet<RiskLevel> = new Set(["READ","SEARCH","ANALYZE","SIMULATE","QUOTE"]);

export const WORLDWAY_SKILLS: readonly SkillDefinition[] = [
  ["travel-requirements","intent_extraction","Extract and validate structured travel requirements."],
  ["trip-planning","concierge_chat","Build and simulate a chronological trip plan."],
  ["flight-analysis","concierge_chat","Analyze flight options using deterministic inventory."],
  ["hotel-analysis","concierge_chat","Analyze hotel options using deterministic inventory."],
  ["tour-analysis","concierge_chat","Analyze tour options and chronology."],
  ["package-analysis","concierge_chat","Analyze complete package candidates."],
  ["destination-intelligence","explanation","Research and analyze destination intelligence."],
  ["booking-readiness-audit","concierge_chat","Audit readiness without executing a booking."],
].map(([name, task, description]) => ({
  name,
  version: "1.0.0",
  task: task as TaskKind,
  description,
  requiredTools: [],
  allowedRisk: SAFE_SKILL_RISKS,
  autonomous: false as const,
}));

export function registerWorldwaySkills(
  registry: { register(s: Skill<any, any>): unknown },
  implementations: Skill<any, any>[] = [],
) {
  for (const skill of implementations) registry.register(skill);
  return registry;
}

export interface SpecialistAgentDefinition {
  name: string;
  skills: string[];
  description: string;
  autonomous: false;
}

export const SPECIALIST_AGENTS: readonly SpecialistAgentDefinition[] = [
  ["flight-agent",["flight-analysis"],"Flight specialist"],
  ["hotel-agent",["hotel-analysis"],"Hotel specialist"],
  ["tour-agent",["tour-analysis"],"Tour specialist"],
  ["cruise-agent",["package-analysis"],"Cruise specialist"],
  ["transfer-agent",["trip-planning"],"Transfer specialist"],
  ["private-aviation-agent",["flight-analysis"],"Private aviation specialist"],
  ["destination-intelligence-agent",["destination-intelligence"],"Destination intelligence specialist"],
  ["visa-policy-agent",["destination-intelligence"],"Visa and policy research specialist"],
  ["package-agent",["package-analysis","trip-planning"],"Package specialist"],
  ["auditor-agent",["booking-readiness-audit","package-analysis"],"Independent package/readiness auditor"],
].map(([name, skills, description]) => ({ name, skills, description, autonomous: false as const }));

export function specialistForGoal(goal: string): SpecialistAgentDefinition[] {
  const g = goal.toLowerCase();
  const keys = g.match(/flight|airline/) ? ["flight-agent"]
    : g.match(/hotel|stay|resort/) ? ["hotel-agent"]
    : g.match(/tour|activity|excursion/) ? ["tour-agent"]
    : g.match(/cruise/) ? ["cruise-agent"]
    : g.match(/jet|private aviation/) ? ["private-aviation-agent"]
    : g.match(/visa|entry|immigration/) ? ["visa-policy-agent"]
    : g.match(/destination|where should|things to do/) ? ["destination-intelligence-agent"]
    : ["package-agent","auditor-agent"];
  return SPECIALIST_AGENTS.filter((a) => keys.includes(a.name));
}

export function skillToolPolicy(registry: ToolRegistry, definition: SkillDefinition) {
  return definition.requiredTools.map((name) => registry.get(name)).filter(Boolean).map((tool) => ({
    name: tool!.name,
    risk: tool!.risk,
    allowed: definition.allowedRisk.has(tool!.risk),
  }));
}
