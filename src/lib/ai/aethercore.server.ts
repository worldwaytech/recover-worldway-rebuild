// Worldway-AetherCore (Azure AI Foundry) — server-only client.
// Worker-safe REST implementation of the azure-ai-projects Responses flow:
// service-principal token (same env vars DefaultAzureCredential reads) → agent-scoped
// OpenAI Responses endpoint, with agent_session_id for conversation continuity.
// Web Search and knowledge bases are configured and executed inside Foundry.

export const AETHERCORE_DEFAULTS = {
  endpoint: "https://wwtg-foundry.services.ai.azure.com/api/projects/wwtg-ai-concierge",
  agentName: "Worldway-AetherCore",
  agentVersion: "3",
  timeoutMs: 45_000,
} as const;

export type AetherCoreConfig = {
  endpoint: string;
  agentName: string;
  agentVersion: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
};

export class AetherCoreError extends Error {
  constructor(public code: "not_configured" | "auth" | "timeout" | "upstream" | "empty", public userMessage: string, public status?: number) {
    super(`${code}${status ? ` (${status})` : ""}`);
  }
}

export function readConfig(env: Record<string, string | undefined> = process.env): AetherCoreConfig {
  return {
    endpoint: (env["AETHERCORE_PROJECT_ENDPOINT"] || AETHERCORE_DEFAULTS.endpoint).replace(/\/+$/, ""),
    agentName: env["AETHERCORE_AGENT_NAME"] || AETHERCORE_DEFAULTS.agentName,
    agentVersion: env["AETHERCORE_AGENT_VERSION"] || AETHERCORE_DEFAULTS.agentVersion,
    tenantId: env["AZURE_TENANT_ID"],
    clientId: env["AZURE_CLIENT_ID"],
    clientSecret: env["AZURE_CLIENT_SECRET"],
  };
}

/** Health/config check — booleans only, never values. */
export function configStatus(cfg = readConfig()) {
  const missing = (["tenantId", "clientId", "clientSecret"] as const).filter((k) => !cfg[k]);
  return {
    configured: missing.length === 0,
    agentName: cfg.agentName,
    agentVersion: cfg.agentVersion,
    endpointHost: new URL(cfg.endpoint).host,
    credentials: { AZURE_TENANT_ID: !!cfg.tenantId, AZURE_CLIENT_ID: !!cfg.clientId, AZURE_CLIENT_SECRET: !!cfg.clientSecret },
  };
}

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "aethercore", event, ...fields }));
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function getToken(cfg: AetherCoreConfig, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string> {
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret)
    throw new AetherCoreError("not_configured", "The concierge is not available right now. Please try again later.");
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "https://ai.azure.com/.default" }),
    signal,
  });
  if (!res.ok) {
    log("auth_failed", { status: res.status });
    throw new AetherCoreError("auth", "The concierge is temporarily unavailable. Please try again shortly.", res.status);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(key, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export function extractText(body: any): string {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  const parts: string[] = [];
  for (const item of body?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) if ((c?.type === "output_text" || c?.type === "text") && typeof c.text === "string") parts.push(c.text);
  }
  return parts.join("\n").trim();
}

export const SESSION_RE = /^[A-Za-z0-9_-]{8,120}$/;

/** Send one user message to Worldway-AetherCore; returns reply + session id to reuse. */
export async function askAetherCore(
  message: string,
  sessionId: string | undefined,
  opts: { cfg?: AetherCoreConfig; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ reply: string; sessionId: string }> {
  const cfg = opts.cfg ?? readConfig();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const session = sessionId && SESSION_RE.test(sessionId) ? sessionId : `wwtg-${crypto.randomUUID()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? AETHERCORE_DEFAULTS.timeoutMs);
  const started = Date.now();
  try {
    const token = await getToken(cfg, fetchImpl, ctrl.signal);
    const url = `${cfg.endpoint}/agents/${encodeURIComponent(cfg.agentName)}/endpoint/protocols/openai/responses?api-version=v1`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ input: message, agent_session_id: session, agent: { type: "agent_reference", name: cfg.agentName, version: cfg.agentVersion } }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log("upstream_error", { status: res.status, ms: Date.now() - started });
      const busy = res.status === 429 || res.status >= 500;
      throw new AetherCoreError("upstream", busy ? "The concierge is busy right now. Please try again in a moment." : "The concierge couldn't process that request.", res.status);
    }
    const reply = extractText(await res.json());
    if (!reply) throw new AetherCoreError("empty", "The concierge didn't return an answer. Please rephrase your request.");
    log("ok", { ms: Date.now() - started, chars: reply.length });
    return { reply, sessionId: session };
  } catch (e) {
    if (e instanceof AetherCoreError) throw e;
    if ((e as Error)?.name === "AbortError") {
      log("timeout", { ms: Date.now() - started });
      throw new AetherCoreError("timeout", "The concierge is taking too long to respond. Please try again.");
    }
    log("network_error", { ms: Date.now() - started });
    throw new AetherCoreError("upstream", "The concierge is temporarily unavailable. Please try again shortly.");
  } finally {
    clearTimeout(timer);
  }
}
