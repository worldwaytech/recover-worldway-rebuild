// TripJack — server-only HTTP client shared by the Cabs and TripSafe suites.
//
// Security invariants:
//  * The single UAT credential is read from process.env inside each call and is
//    never returned, logged, cached in a client-visible place, or embedded in a
//    URL. Only presence is ever exposed.
//  * Requests are UAT-only; there is no production host in the codebase.
//  * Every request carries a correlation ID for the Activity Timeline, and all
//    logging goes through a redactor that strips credential-bearing headers and
//    obvious PII fields.
//  * Unmapped capabilities fail closed instead of calling a guessed URL.
import {
  TRIPJACK_API_KEY_SECRET,
  TRIPJACK_TIMEOUT_MS,
  TRIPJACK_UAT_BASE_URL,
  tripjackCapability,
  type TripjackSuite,
} from "./config";

export type TripjackError = {
  kind:
    | "not-configured"
    | "capability-unmapped"
    | "timeout"
    | "network"
    | "http"
    | "invalid-response";
  status?: number;
  message: string;
  correlationId: string;
};

export type TripjackResult<T> = { ok: true; data: T; correlationId: string } | {
  ok: false;
  error: TripjackError;
};

/** Presence-only credential view. Never returns the value. */
export function tripjackCredentialStatus(): { configured: boolean; missing: string[] } {
  const configured = Boolean(process.env[TRIPJACK_API_KEY_SECRET]);
  return { configured, missing: configured ? [] : [TRIPJACK_API_KEY_SECRET] };
}

export function tripjackCorrelationId(suite: TripjackSuite, capability: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `wwtg-tj-${suite}-${capability}-${Date.now().toString(36)}-${rand}`;
}

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "password",
  "token",
  "email",
  "phone",
  "mobile",
  "contactnumber",
  "passportno",
  "pan",
  "cardnumber",
  "cvv",
]);

/** Deep-redacts credential and PII fields before anything is logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase().replace(/[^a-z_]/g, "")) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type TripjackLogEntry = {
  at: string;
  correlationId: string;
  suite: TripjackSuite;
  capability: string;
  path: string;
  status: number | null;
  durationMs: number;
  outcome: "ok" | "error";
  detail?: string;
};

const logs: TripjackLogEntry[] = [];

export function tripjackLogs(limit = 50): TripjackLogEntry[] {
  return logs.slice(-limit).reverse();
}

function log(entry: TripjackLogEntry): void {
  logs.push(entry);
  if (logs.length > 300) logs.splice(0, logs.length - 300);
  // Safe console line: no credentials, no raw payload.
  console.info(
    `[tripjack] ${entry.suite}/${entry.capability} ${entry.outcome} status=${entry.status ?? "-"} ${entry.durationMs}ms cid=${entry.correlationId}`,
  );
}

/**
 * Calls a documented TripJack UAT operation.
 *
 * `capability` must resolve to a mapped path in config.ts. Until the official
 * Cabs v2 / TripSafe v5.1 operation is confirmed, the call fails closed with
 * `capability-unmapped` — we never invent supplier endpoints.
 */
export async function tripjackCall<T = unknown>(
  suite: TripjackSuite,
  capability: string,
  body?: unknown,
): Promise<TripjackResult<T>> {
  const correlationId = tripjackCorrelationId(suite, capability);
  const started = Date.now();

  const apiKey = process.env[TRIPJACK_API_KEY_SECRET];
  if (!apiKey) {
    return {
      ok: false,
      error: {
        kind: "not-configured",
        message: "TripJack UAT credential is not configured on the server.",
        correlationId,
      },
    };
  }

  const cap = tripjackCapability(suite, capability);
  if (!cap || !cap.path) {
    return {
      ok: false,
      error: {
        kind: "capability-unmapped",
        message: `TripJack ${suite} capability "${capability}" has no documented endpoint mapped yet.`,
        correlationId,
      },
    };
  }

  const url = `${TRIPJACK_UAT_BASE_URL}${cap.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIPJACK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: cap.method,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Correlation-Id": correlationId,
      },
      body: cap.method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        log({
          at: new Date().toISOString(),
          correlationId,
          suite,
          capability,
          path: cap.path,
          status: response.status,
          durationMs: Date.now() - started,
          outcome: "error",
        });
        return {
          ok: false,
          error: {
            kind: "invalid-response",
            status: response.status,
            message: "TripJack returned a non-JSON response.",
            correlationId,
          },
        };
      }
    }

    const entry: TripjackLogEntry = {
      at: new Date().toISOString(),
      correlationId,
      suite,
      capability,
      path: cap.path,
      status: response.status,
      durationMs: Date.now() - started,
      outcome: response.ok ? "ok" : "error",
      detail: response.ok ? undefined : JSON.stringify(redact(parsed)).slice(0, 2000),
    };
    log(entry);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: "http",
          status: response.status,
          message: `TripJack ${suite}/${capability} responded HTTP ${response.status}.`,
          correlationId,
        },
      };
    }
    return { ok: true, data: parsed as T, correlationId };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    log({
      at: new Date().toISOString(),
      correlationId,
      suite,
      capability,
      path: cap.path,
      status: null,
      durationMs: Date.now() - started,
      outcome: "error",
    });
    return {
      ok: false,
      error: {
        kind: aborted ? "timeout" : "network",
        message: aborted
          ? `TripJack ${suite}/${capability} timed out after ${TRIPJACK_TIMEOUT_MS}ms.`
          : `TripJack ${suite}/${capability} could not be reached.`,
        correlationId,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
