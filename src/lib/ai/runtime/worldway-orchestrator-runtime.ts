import {
  DeterministicTaskExecutor,
  RoutedModelTaskExecutor,
  SpecialistTaskExecutor,
  ToolFabricTaskExecutor,
  WorldwayOrchestrator,
  type OrchestrationTask,
  type TaskExecutor,
} from "./orchestrator";
import { SpecialistAgentRegistry } from "./specialist-agents";
import { validateWorldwayDecisionContract } from "./decision-contract";
import { projectDecisionContractToRankingProfile } from "../../engine/decision-contract-adapter";
import type { ToolRegistry } from "../tools/fabric";

export interface WorldwayOrchestratorRuntime {
  orchestrator: WorldwayOrchestrator;
  specialists: SpecialistAgentRegistry;
}

export interface WorldwayOrchestratorRuntimeOptions {
  tools: ToolRegistry;
  /** Optional routed model execution. Provider/model selection stays inside the existing router. */
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
  if (Object.prototype.hasOwnProperty.call(value, "modelDecision")) {
    throw new Error(`raw_model_decision_rejected:${task.id}`);
  }
  const contract = value.decisionContract;
  if (task.decisionContractFrom && contract === undefined) throw new Error(`decision_contract_missing:${task.id}`);
  if (contract === undefined) return input;

  const acceptedDecisionKinds = task.acceptedDecisionKinds;
  if (!acceptedDecisionKinds?.length) throw new Error(`decision_contract_policy_missing:${task.id}`);

  const validated = validateWorldwayDecisionContract(contract, {
    expectedCorrelationId: correlationId,
    expectedSourceTaskId: task.decisionContractFrom ?? task.id,
    acceptedDecisionKinds,
  });

  if (!validated) throw new Error(`decision_contract_runtime_validation_failed:${task.id}`);

  const projection = task.metadata?.decisionContractProjection;
  if (projection === "ranking") {
    if (validated.decisionKind !== "ranking" && validated.decisionKind !== "recommendation") {
      throw new Error(`decision_contract_ranking_projection_rejected:${task.id}`);
    }
    const rankingProfile = projectDecisionContractToRankingProfile(validated);
    return { ...value, decisionContract: validated, rankingProfile };
  }

  return { ...value, decisionContract: validated };
}

export function createWorldwayOrchestratorRuntime(
  options: WorldwayOrchestratorRuntimeOptions,
): WorldwayOrchestratorRuntime {
  const specialists = new SpecialistAgentRegistry();
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
