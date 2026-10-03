import {
  DeterministicTaskExecutor,
  RoutedModelTaskExecutor,
  SpecialistTaskExecutor,
  ToolFabricTaskExecutor,
  WorldwayOrchestrator,
  validateWorldwayDecisionContract,
  type OrchestrationTask,
  type TaskExecutor,
  type WorldwayDecisionKind,
} from "./orchestrator";
import type { ToolRegistry } from "../tools/fabric";

export interface WorldwayOrchestratorRuntime {
  orchestrator: WorldwayOrchestrator;
  specialists: import("./specialist-agents").SpecialistAgentRegistry;
}

export interface WorldwayOrchestratorRuntimeOptions {
  tools: ToolRegistry;
  model?: {
    router?: import("../router/router").RouterDeps;
    invoke: (model: import("../router/types").ModelSpec, task: import("../router/types").TaskKind, input: unknown, correlationId: string) => Promise<unknown>;
    validateOutput: (task: import("../router/types").TaskKind, value: unknown, correlationId: string) => import("./orchestrator").ValidatedModelOutput | null;
  };
  deterministic?: (task: OrchestrationTask, context: Parameters<TaskExecutor["execute"]>[1]) => Promise<unknown>;
}

function validatedDeterministicInput(task: OrchestrationTask, input: unknown, correlationId: string): unknown {
  if (task.kind !== "deterministic" || !input || typeof input !== "object" || Array.isArray(input)) return input;

  const value = input as Record<string, unknown>;
  const contract = value.decisionContract;
  if (contract === undefined) return input;

  const acceptedDecisionKinds = task.acceptedDecisionKinds;
  if (!acceptedDecisionKinds?.length) throw new Error(`decision_contract_policy_missing:${task.id}`);

  const validated = validateWorldwayDecisionContract(contract, {
    expectedCorrelationId: correlationId,
    expectedSourceTaskId: task.id,
    acceptedDecisionKinds,
  });

  if (!validated) throw new Error(`decision_contract_runtime_validation_failed:${task.id}`);

  return { ...value, decisionContract: validated };
}

export function createWorldwayOrchestratorRuntime(
  options: WorldwayOrchestratorRuntimeOptions,
): WorldwayOrchestratorRuntime {
  const specialists = new (requireSpecialistRegistry())();
  const toolExecutor = new ToolFabricTaskExecutor(options.tools);
  const specialistExecutor = new SpecialistTaskExecutor(specialists);
  const modelExecutor = options.model ? new RoutedModelTaskExecutor(options.model) : undefined;
  const deterministicExecutor = new DeterministicTaskExecutor(
    options.deterministic ?? (async (task) => task.input),
  );

  const executor: TaskExecutor = {
    async execute(task, context) {
      if (task.kind === "specialist") return specialistExecutor.execute(task, context);
      if (task.kind === "model") {
        if (!modelExecutor) throw new Error("model_executor_not_configured");
        return modelExecutor.execute(task, context);
      }
      if (task.kind === "deterministic") {
        const validatedTask = { ...task, input: validatedDeterministicInput(task, task.input, context.correlationId) };
        return deterministicExecutor.execute(validatedTask, context);
      }
      return toolExecutor.execute(task, context);
    },
  };

  return {
    orchestrator: new WorldwayOrchestrator(executor, toolExecutor),
    specialists,
  };
}

function requireSpecialistRegistry() {
  // Kept local to avoid widening the runtime module's public dependency surface.
  return import("./specialist-agents").then ? import("./specialist-agents").SpecialistAgentRegistry : undefined as never;
}
