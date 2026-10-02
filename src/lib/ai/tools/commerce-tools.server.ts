// Existing live commerce tools registered in the Tool Fabric. Execution still goes
// through runCommerce (the single commerce home) — no new supplier logic.
import { tool } from "ai";
import { commerceSpecs } from "./worldway-tools.server";
import { ToolRegistry, type ToolContext } from "./fabric";
import { newCorrelationId } from "../router/telemetry";

export function commerceRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  for (const s of commerceSpecs()) reg.register(s);
  return reg;
}

/** Concierge principal: public, read/quote only. Never has high-risk grants. */
export function conciergeContext(correlationId = newCorrelationId(), signal?: AbortSignal, context: ToolContext["context"] = "concierge_chat"): ToolContext {
  return { correlationId, context, principal: { permission: "public", scopes: ["commerce:read", "commerce:quote"] }, signal };
}

/** AI SDK tool set backed by the fabric (policy, schema, safety, audit on every call). */
export function aiSdkTools(reg: ToolRegistry, ctx: ToolContext, onResult?: (name: string, ok: boolean) => void) {
  return Object.fromEntries(reg.visible(ctx).map((t) => [t.name, tool({
    description: t.description,
    inputSchema: t.input as any,
    execute: async (input: unknown) => {
      try { const r = await reg.invoke(t.name, input, ctx); onResult?.(t.name, true); return r; }
      catch (e) { onResult?.(t.name, false); throw e; }
    },
  })]));
}
