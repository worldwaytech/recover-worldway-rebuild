import {
  DeterministicTaskExecutor,
  SpecialistTaskExecutor,
  ToolFabricTaskExecutor,
  WorldwayOrchestrator,
  type OrchestrationTask,
  type TaskExecutor,
} from "./orchestrator";
import { SpecialistAgentRegistry } from "./specialist-agents";
import type { ToolRegistry } from "../tools/fabric";

export interface WorldwayOrchestratorRuntime {
  orchestrator: WorldwayOrchestrator;
  specialists: SpecialistAgentRegistry;
}

export interface WorldwayOrchestratorRuntimeOptions {
  tools: ToolRegistry;
  deterministic?: (task: OrchestrationTask, context: Parameters<TaskExecutor["execute"]>[1]) => Promise<unknown>;
}

/**
 * Canonical runtime composition for the post-Phase-16 orchestration layer.
 *
 * Specialist handlers remain bounded analysis/delegation only. Tool Fabric remains
 * the sole tool execution boundary, while deterministic commerce engines remain
 * the authoritative execution path.
 */
export function createWorldwayOrchestratorRuntime(
  options: WorldwayOrchestratorRuntimeOptions,
): WorldwayOrchestratorRuntime {
  const specialists = new SpecialistAgentRegistry();
  const toolExecutor = new ToolFabricTaskExecutor(options.tools);
  const specialistExecutor = new SpecialistTaskExecutor(specialists);
  const deterministicExecutor = new DeterministicTaskExecutor(
    options.deterministic ?? (async (task) => task.input),
  );

  const executor: TaskExecutor = {
    async execute(task, context) {
      if (task.kind === "specialist") return specialistExecutor.execute(task, context);
      if (task.kind === "deterministic") return deterministicExecutor.execute(task, context);
      return toolExecutor.execute(task, context);
    },
  };

  return {
    orchestrator: new WorldwayOrchestrator(executor, toolExecutor),
    specialists,
  };
}
