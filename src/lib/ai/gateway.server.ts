// Lovable AI Gateway (Responses) — server-only. Streams every call and consumes
// the final result server-side. AI never supplies inventory, prices or schedules.
import { NoObjectGeneratedError, Output, streamText, type ModelMessage } from "ai";
import type { z } from "zod";
import { lovableProvider, ProviderNotConfiguredError } from "./router/adapters.server";
import { DEFAULT_CHAT_MODEL } from "./router/registry";
import { withRoute } from "./router/router";
import { installTraceStore } from "./router/trace-store.server";
import type { TaskKind } from "./router/types";

// Model selection now goes through the Worldway Model Router (src/lib/ai/router).
export const AI_MODEL = DEFAULT_CHAT_MODEL;
installTraceStore();

export class AiUnavailableError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export function provider() {
  try { return lovableProvider(); }
  catch (e) { if (e instanceof ProviderNotConfiguredError) throw new AiUnavailableError("AI is not configured."); throw e; }
}

const OPTS = {
  openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
} as const;

function mapError(e: unknown): never {
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 402) throw new AiUnavailableError("AI credits are exhausted for this workspace.", 402);
  if (status === 429) throw new AiUnavailableError("AI is busy right now. Please try again shortly.", 429);
  if (status === 403) throw new AiUnavailableError("AI access was denied for this request.", 403);
  throw new AiUnavailableError("AI could not process this request.", status);
}

export async function aiObject<T>(system: string, messages: ModelMessage[], schema: z.ZodType<T>, task: TaskKind = "intent_extraction"): Promise<T | null> {
  try {
    return await withRoute(task, async (m) => {
    const result = streamText({ model: provider().responses(m.id), system, messages, maxRetries: 0, output: Output.object({ schema }), providerOptions: OPTS as never });
    return (await result.output) as T;
    });
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      try { return schema.parse(JSON.parse(e.text ?? "")); } catch { return null; }
    }
    if (e instanceof AiUnavailableError) throw e;
    mapError(e);
  }
}

export async function aiText(system: string, messages: ModelMessage[], task: TaskKind = "explanation"): Promise<string> {
  try {
    return await withRoute(task, async (m) => {
      const result = streamText({ model: provider().responses(m.id), system, messages, maxRetries: 0, providerOptions: OPTS as never });
      return (await result.text).trim();
    });
  } catch (e) {
    mapError(e);
  }
}
