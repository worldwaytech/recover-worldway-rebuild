// Provider adapters — the only place provider SDKs/clients are constructed.
import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "../run-id.server";
import type { ProviderId } from "./types";

export class ProviderNotConfiguredError extends Error {
  status = 401;
  constructor(public provider: ProviderId) { super(`${provider} is not configured`); }
}

/** Lovable AI Gateway (Responses) — existing behaviour, unchanged. */
export function lovableProvider(runId?: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new ProviderNotConfiguredError("lovable");
  const runIdFetch = createLovableAiGatewayRunIdFetch(runId);
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
}

/** AetherCore (Azure Foundry agent) — delegates to the existing REST client. */
export async function aetherCoreAdapter() {
  return import("../aethercore.server");
}

/**
 * Google Gemini direct adapter — interface only. Disabled in the registry and
 * throws until credentials and an approved data-retention review exist.
 */
/** Shared contract every direct provider adapter implements. */
export interface TextAdapter { provider: ProviderId; configured(): boolean; generateText(system: string, prompt: string, signal?: AbortSignal): Promise<string> }

/** OpenAI direct adapter — interface only; disabled until a key and approval exist. */
export function openAiDirectAdapter(): TextAdapter {
  return { provider: "openai", configured: () => !!process.env["OPENAI_API_KEY"], async generateText() { throw new ProviderNotConfiguredError("openai"); } };
}

export interface GeminiAdapter { generateText(system: string, prompt: string, signal?: AbortSignal): Promise<string> }
export function geminiAdapter(): GeminiAdapter {
  return {
    async generateText() {
      if (!process.env["GOOGLE_GEMINI_API_KEY"]) throw new ProviderNotConfiguredError("google");
      throw new ProviderNotConfiguredError("google");
    },
  };
}
