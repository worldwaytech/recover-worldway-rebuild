// Provider + model registry and routing policies (pure data + selection).
import type { ModelCapability, ModelSpec, ProviderId, ProviderSpec, RoutingPolicy, TaskKind } from "./types";

export const DEFAULT_CHAT_MODEL = "openai/gpt-6-astra";

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  lovable: { id: "lovable", label: "Lovable AI Gateway", requiredEnv: ["LOVABLE_API_KEY"], zeroRetention: true },
  aethercore: { id: "aethercore", label: "Worldway-AetherCore (Azure)", requiredEnv: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"], zeroRetention: true },
  // Adapter interface only — disabled until credentials and approval exist.
  google: { id: "google", label: "Google Gemini (direct)", requiredEnv: ["GOOGLE_GEMINI_API_KEY"], zeroRetention: false },
};

export const MODELS: ModelSpec[] = [
  { id: DEFAULT_CHAT_MODEL, provider: "lovable", capabilities: ["chat", "tools", "structured", "reasoning", "vision", "pdf"], costTier: 3, latencyMs: 4000, rpm: 120, enabled: true },
  { id: "aethercore/Worldway-AetherCore", provider: "aethercore", capabilities: ["chat", "agent"], costTier: 3, latencyMs: 8000, rpm: 60, enabled: true },
  { id: "direct-google:unassigned", provider: "google", capabilities: ["chat", "structured", "vision"], costTier: 2, latencyMs: 3000, rpm: 60, enabled: false },
];

export const POLICIES: Record<TaskKind, RoutingPolicy> = {
  intent_extraction: { task: "intent_extraction", required: ["structured"], preferred: [DEFAULT_CHAT_MODEL], fallback: [] },
  document_ingest: { task: "document_ingest", required: ["structured", "pdf"], preferred: [DEFAULT_CHAT_MODEL], fallback: [] },
  explanation: { task: "explanation", required: ["chat"], preferred: [DEFAULT_CHAT_MODEL], fallback: [] },
  concierge_chat: { task: "concierge_chat", required: ["chat", "tools"], preferred: [DEFAULT_CHAT_MODEL], fallback: [] },
  concierge_voice: { task: "concierge_voice", required: ["chat", "tools"], preferred: [DEFAULT_CHAT_MODEL], fallback: [] },
};

export function model(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function hasCapabilities(m: ModelSpec, required: ModelCapability[]): boolean {
  return required.every((c) => m.capabilities.includes(c));
}

/** Booleans only — never values. */
export function providerConfigured(p: ProviderId, env: Record<string, string | undefined> = process.env): boolean {
  return PROVIDERS[p].requiredEnv.every((k) => !!env[k]);
}
