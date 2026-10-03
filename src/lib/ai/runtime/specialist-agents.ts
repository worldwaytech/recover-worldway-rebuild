import type { WorldwayOrchestrationContext } from "./context-bridge";
import { sanitizeOrchestrationEvidence, type OrchestrationEvidence } from "./orchestration-trace";
import type { OrchestrationContext, OrchestrationTask, SpecialistDelegate } from "./orchestrator";

export const SPECIALIST_AGENT_KEYS = [
  "flight_intelligence","hotel_intelligence","experience_intelligence",
  "luxury_private_aviation","cruise_land","destination_intelligence",
  "supplier_operations","pricing_revenue","booking_fulfilment","risk_trust",
] as const;

export type SpecialistAgentKey = (typeof SPECIALIST_AGENT_KEYS)[number];

export interface SpecialistAgentDefinition {
  key: SpecialistAgentKey;
  description: string;
  allowedModes: readonly ["plan","analyze","recommend"];
  canMutateCommerce: false;
  requiresDeterministicHandoff: true;
}

const DESCRIPTIONS: Record<SpecialistAgentKey,string> = {
  flight_intelligence:"Flight routing, schedule and feasibility analysis.",
  hotel_intelligence:"Hotel suitability and stay-feasibility analysis.",
  experience_intelligence:"Activities, tours and experience discovery and sequencing.",
  luxury_private_aviation:"Luxury travel and private aviation planning without booking authority.",
  cruise_land:"Cruise, rail and land-journey composition and compatibility.",
  destination_intelligence:"Destination conditions, geography, timing and contextual intelligence.",
  supplier_operations:"Supplier capability, certification, health and operational evidence.",
  pricing_revenue:"Pricing, margin and commercial scenario analysis.",
  booking_fulfilment:"Booking-readiness and fulfilment planning; execution remains deterministic.",
  risk_trust:"Risk, trust, policy, safety and evidence-quality analysis.",
};

export const SPECIALIST_AGENT_DEFINITIONS: readonly SpecialistAgentDefinition[] =
  SPECIALIST_AGENT_KEYS.map((key) => ({
    key,
    description: DESCRIPTIONS[key],
    allowedModes: ["plan","analyze","recommend"] as const,
    canMutateCommerce: false as const,
    requiresDeterministicHandoff: true as const,
  }));

export interface SpecialistInvocation {
  specialist: SpecialistAgentKey;
  taskId: string;
  objective: string;
  input?: unknown;
}

export interface SpecialistResult {
  specialist: SpecialistAgentKey;
  taskId: string;
  state: "completed" | "rejected";
  output?: unknown;
  evidence?: OrchestrationEvidence[];
  reason?: string;
}

export function validateSpecialistInvocation(invocation: SpecialistInvocation): string[] {
  const problems: string[] = [];
  if (!invocation.taskId.trim()) problems.push("missing_task_id");
  if (!invocation.objective.trim()) problems.push("empty_objective");
  return problems;
}

export interface SpecialistHandler {
  handle(invocation: SpecialistInvocation, context: WorldwayOrchestrationContext): Promise<unknown>;
}

function isWorldwayOrchestrationContext(context: OrchestrationContext): context is WorldwayOrchestrationContext {
  return "traveller" in context && "knowledge" in context && context.precedence === "current_request_over_memory_over_knowledge";
}

export class SpecialistAgentRegistry implements SpecialistDelegate {
  private readonly handlers = new Map<SpecialistAgentKey, SpecialistHandler>();

  register(key: SpecialistAgentKey, handler: SpecialistHandler): this {
    if (this.handlers.has(key)) throw new Error(`duplicate_specialist_handler:${key}`);
    this.handlers.set(key, handler);
    return this;
  }

  has(key: SpecialistAgentKey): boolean { return this.handlers.has(key); }
  list(): readonly SpecialistAgentDefinition[] { return SPECIALIST_AGENT_DEFINITIONS; }

  async delegate(task: OrchestrationTask, context: OrchestrationContext): Promise<SpecialistResult> {
    if (task.kind !== "specialist" || !task.specialist) throw new Error(`invalid_specialist_task:${task.id}`);
    if (!SPECIALIST_AGENT_KEYS.includes(task.specialist as SpecialistAgentKey)) {
      throw new Error(`unknown_specialist:${task.specialist}`);
    }
    const specialist = task.specialist as SpecialistAgentKey;
    const handler = this.handlers.get(specialist);
    if (!handler) return { specialist, taskId: task.id, state: "rejected", reason: "specialist_handler_not_registered" };
    if (!isWorldwayOrchestrationContext(context)) {
      return { specialist, taskId: task.id, state: "rejected", reason: "worldway_context_required" };
    }
    const input = task.input as { objective?: unknown } | undefined;
    const invocation = {
      specialist, taskId: task.id,
      objective: String(input?.objective ?? ""),
      input: task.input,
    };
    const problems = validateSpecialistInvocation(invocation);
    if (problems.length) return { specialist, taskId: task.id, state: "rejected", reason: problems.join("|") };
    const output = await handler.handle(invocation, context);
    const evidence = output && typeof output === "object"
      ? sanitizeOrchestrationEvidence((output as Record<string, unknown>).evidence)
      : [];
    return { specialist, taskId: task.id, state: "completed", output, ...(evidence.length ? { evidence } : {}) };
  }
}
