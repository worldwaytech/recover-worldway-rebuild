// Worldway Specialist Agent Framework.
// Post-Phase-16 Upgrade 4: deterministic specialist registration and delegation.
// Specialists are subordinate to the Orchestrator and Tool Fabric.
// No specialist receives autonomous booking/payment authority.

import type {
  OrchestrationContext,
  OrchestrationTask,
  SpecialistDelegate,
} from "./orchestrator";
import type { Permission, RiskLevel, Scope } from "../tools/fabric";
import { HIGH_RISK } from "../tools/fabric";

export interface SpecialistCapability {
  id: string;
  description: string;
}

export interface SpecialistSpec {
  name: string;
  version: string;
  description: string;
  capabilities: readonly SpecialistCapability[];
  allowedRisks: ReadonlySet<RiskLevel>;
  permission: Permission;
  scopes: readonly Scope[];
  contexts: readonly OrchestrationContext["toolContext"]["context"][];
  maxSteps: number;
  maxToolCalls: number;
  execute: (task: OrchestrationTask, ctx: OrchestrationContext) => Promise<unknown>;
}

export interface SpecialistMatch {
  name: string;
  capability: string;
  version: string;
}

export class SpecialistDeniedError extends Error {
  constructor(public specialist: string, public reason: string) {
    super(`Specialist ${specialist} denied: ${reason}`);
  }
}

const PERMISSION_RANK: Record<Permission, number> = {
  public: 0,
  authenticated: 1,
  staff: 2,
  super_admin: 3,
};

function validVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function canRun(spec: SpecialistSpec, ctx: OrchestrationContext): string | null {
  if (!validVersion(spec.version)) return "invalid_version";
  if (spec.maxSteps <= 0 || spec.maxToolCalls < 0) return "invalid_budget";
  if (!spec.contexts.includes(ctx.toolContext.context)) return "context";
  if (PERMISSION_RANK[ctx.toolContext.principal.permission] < PERMISSION_RANK[spec.permission]) return "permission";
  if (!spec.scopes.every((scope) => ctx.toolContext.principal.scopes.includes(scope))) return "scope";
  if ([...spec.allowedRisks].some((risk) => HIGH_RISK.has(risk))) return "high_risk_capability";
  return null;
}

export class SpecialistRegistry {
  private readonly specialists = new Map<string, SpecialistSpec>();

  register(spec: SpecialistSpec): this {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(spec.name)) {
      throw new Error(`Invalid specialist name ${spec.name}`);
    }
    if (!validVersion(spec.version)) {
      throw new Error(`Specialist ${spec.name}: invalid version`);
    }
    if (this.specialists.has(spec.name)) {
      throw new Error(`Duplicate specialist ${spec.name}`);
    }
    if (!spec.capabilities.length) {
      throw new Error(`Specialist ${spec.name}: capability_required`);
    }
    if ([...spec.allowedRisks].some((risk) => HIGH_RISK.has(risk))) {
      throw new Error(`Specialist ${spec.name}: high_risk_not_allowed`);
    }
    this.specialists.set(spec.name, spec);
    return this;
  }

  get(name: string): SpecialistSpec | undefined {
    return this.specialists.get(name);
  }

  list(): readonly SpecialistSpec[] {
    return [...this.specialists.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  match(capability: string, ctx: OrchestrationContext): SpecialistMatch[] {
    return this.list()
      .filter((spec) => spec.capabilities.some((item) => item.id === capability))
      .filter((spec) => canRun(spec, ctx) === null)
      .map((spec) => ({
        name: spec.name,
        capability,
        version: spec.version,
      }));
  }
}

export class RegistrySpecialistDelegate implements SpecialistDelegate {
  constructor(private readonly registry: SpecialistRegistry) {}

  async delegate(task: OrchestrationTask, ctx: OrchestrationContext): Promise<unknown> {
    const name = task.specialist;
    if (!name) throw new SpecialistDeniedError("unknown", "missing_specialist");

    const spec = this.registry.get(name);
    if (!spec) throw new SpecialistDeniedError(name, "unknown_specialist");

    const denied = canRun(spec, ctx);
    if (denied) throw new SpecialistDeniedError(name, denied);

    const capability = typeof task.metadata?.capability === "string"
      ? task.metadata.capability
      : undefined;

    if (capability && !spec.capabilities.some((item) => item.id === capability)) {
      throw new SpecialistDeniedError(name, "capability_mismatch");
    }

    if (task.metadata?.autonomousBooking === true) {
      throw new SpecialistDeniedError(name, "autonomous_booking_disabled");
    }

    // Specialist execution remains subordinate to the orchestrator.
    // Any external operation must use ctx.toolContext through the Tool Fabric.
    return spec.execute(task, ctx);
  }
}
