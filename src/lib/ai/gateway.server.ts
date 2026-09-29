// Lovable AI Gateway (Responses) — server-only. Streams every call and consumes
// the final result server-side. AI never supplies inventory, prices or schedules.
import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText, type ModelMessage } from "ai";
import type { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export const AI_MODEL = "openai/gpt-6-astra";

export class AiUnavailableError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

function provider() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiUnavailableError("AI is not configured.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
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

export async function aiObject<T>(system: string, messages: ModelMessage[], schema: z.ZodType<T>): Promise<T | null> {
  try {
    const result = streamText({ model: provider().responses(AI_MODEL), system, messages, maxRetries: 0, output: Output.object({ schema }), providerOptions: OPTS as never });
    return (await result.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      try { return schema.parse(JSON.parse(e.text ?? "")); } catch { return null; }
    }
    if (e instanceof AiUnavailableError) throw e;
    mapError(e);
  }
}

export async function aiText(system: string, messages: ModelMessage[]): Promise<string> {
  try {
    const result = streamText({ model: provider().responses(AI_MODEL), system, messages, maxRetries: 0, providerOptions: OPTS as never });
    return (await result.text).trim();
  } catch (e) {
    mapError(e);
  }
}
