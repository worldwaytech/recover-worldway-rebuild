import { describe, expect, it, vi } from "vitest";
import {
  RegistrySpecialistDelegate,
  SpecialistDeniedError,
  SpecialistRegistry,
} from "../specialists";
import type { OrchestrationContext, OrchestrationTask } from "../orchestrator";

function context(): OrchestrationContext {
  return {
    correlationId: "corr-1",
    toolContext: {
      correlationId: "corr-1",
      context: "agent_runtime",
      principal: {
        permission: "authenticated",
        scopes: ["journey:read", "journey:simulate"],
        userId: "user-1",
      },
    },
    facts: {},
  };
}

const task: OrchestrationTask = {
  id: "research",
  kind: "specialist",
  specialist: "destination-research",
  metadata: { capability: "destination_research" },
};

describe("Specialist Agent Framework", () => {
  it("registers specialists deterministically and matches permitted capabilities", () => {
    const registry = new SpecialistRegistry();
    registry.register({
      name: "destination-research",
      version: "1.0.0",
      description: "Destination research specialist",
      capabilities: [{ id: "destination_research", description: "Research destinations" }],
      allowedRisks: new Set(["READ", "SEARCH", "ANALYZE"]),
      permission: "authenticated",
      scopes: ["journey:read"],
      contexts: ["agent_runtime"],
      maxSteps: 4,
      maxToolCalls: 6,
      execute: vi.fn(),
    });

    expect(registry.match("destination_research", context())).toEqual([{
      name: "destination-research",
      capability: "destination_research",
      version: "1.0.0",
    }]);
  });

  it("rejects specialists when permission or scope is insufficient", () => {
    const registry = new SpecialistRegistry();
    registry.register({
      name: "staff-research",
      version: "1.0.0",
      description: "Staff-only specialist",
      capabilities: [{ id: "research", description: "Research" }],
      allowedRisks: new Set(["READ"]),
      permission: "staff",
      scopes: ["journey:read", "admin"],
      contexts: ["agent_runtime"],
      maxSteps: 2,
      maxToolCalls: 2,
      execute: vi.fn(),
    });

    expect(registry.match("research", context())).toEqual([]);
  });

  it("delegates only to a registered capability-compatible specialist", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const registry = new SpecialistRegistry().register({
      name: "destination-research",
      version: "1.0.0",
      description: "Destination research specialist",
      capabilities: [{ id: "destination_research", description: "Research destinations" }],
      allowedRisks: new Set(["READ", "SEARCH"]),
      permission: "authenticated",
      scopes: ["journey:read"],
      contexts: ["agent_runtime"],
      maxSteps: 4,
      maxToolCalls: 6,
      execute,
    });

    await new RegistrySpecialistDelegate(registry).delegate(task, context());
    expect(execute).toHaveBeenCalledOnce();
  });

  it("blocks capability mismatch and autonomous booking", async () => {
    const registry = new SpecialistRegistry().register({
      name: "destination-research",
      version: "1.0.0",
      description: "Destination research specialist",
      capabilities: [{ id: "destination_research", description: "Research destinations" }],
      allowedRisks: new Set(["READ"]),
      permission: "authenticated",
      scopes: ["journey:read"],
      contexts: ["agent_runtime"],
      maxSteps: 4,
      maxToolCalls: 6,
      execute: vi.fn(),
    });
    const delegate = new RegistrySpecialistDelegate(registry);

    await expect(delegate.delegate({
      ...task,
      metadata: { capability: "flight_booking" },
    }, context())).rejects.toBeInstanceOf(SpecialistDeniedError);

    await expect(delegate.delegate({
      ...task,
      metadata: { capability: "destination_research", autonomousBooking: true },
    }, context())).rejects.toThrow("autonomous_booking_disabled");
  });

  it("rejects high-risk specialist registration", () => {
    const registry = new SpecialistRegistry();
    expect(() => registry.register({
      name: "booking-agent",
      version: "1.0.0",
      description: "Booking specialist",
      capabilities: [{ id: "booking", description: "Book" }],
      allowedRisks: new Set(["BOOK"]),
      permission: "authenticated",
      scopes: ["booking:write"],
      contexts: ["agent_runtime"],
      maxSteps: 4,
      maxToolCalls: 4,
      execute: vi.fn(),
    })).toThrow("high_risk_not_allowed");
  });
});
