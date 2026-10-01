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
  tripjackBaseUrl,
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

export type TripjackResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: TripjackError; correlationId: string };

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
  "agentid",
  "agentemail",
  "agentphone",
]);

/** Deep-redacts credential and PII fields before anything is logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase().replace(/[^a-z_]/g, ""))
        ? REDACTED
        : redact(v, depth + 1);
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

/** Best-effort extraction of the supplier booking id for evidence indexing. */
function supplierBookingIdFrom(...sources: unknown[]): string | null {
  for (const s of sources) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const data =
      (o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : undefined) ??
      {};
    for (const k of ["bookingId", "bookingIds", "bid", "id"]) {
      const v = o[k] ?? data[k];
      if (typeof v === "string" && v.length >= 6 && v.length <= 40) return v;
    }
  }
  return null;
}

type EvidenceRecord = {
  correlationId: string;
  suite: TripjackSuite;
  capability: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  requestBody?: unknown;
  status: number | null;
  responseBody: unknown;
  durationMs: number;
  outcome: "ok" | "error";
  errorKind?: string;
};

/**
 * Persists the certification evidence record (request + response JSON, one row
 * per supplier call). Credentials are never part of the record: headers are
 * not stored and the body never contains the key. Failures are swallowed so an
 * evidence write can never break a customer flow.
 */
async function persistEvidence(rec: EvidenceRecord): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const toJson = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    await supabaseAdmin.from("tripjack_api_logs").insert({
      correlation_id: rec.correlationId,
      suite: rec.suite,
      capability: rec.capability,
      method: rec.method,
      path: rec.path,
      environment: "uat",
      request_query: toJson(rec.query),
      request_body: toJson(rec.requestBody),
      response_status: rec.status,
      response_body: toJson(rec.responseBody),
      duration_ms: rec.durationMs,
      outcome: rec.outcome,
      error_kind: rec.errorKind ?? null,
      test_case: `${rec.suite}/${rec.capability}`,
      supplier_booking_id: supplierBookingIdFrom(rec.responseBody, rec.requestBody, rec.query),
    });
  } catch (error) {
    console.warn(
      "[tripjack] evidence persistence skipped:",
      error instanceof Error ? error.message : "unknown",
    );
  }
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
  query?: Record<string, string>,
): Promise<TripjackResult<T>> {
  const correlationId = tripjackCorrelationId(suite, capability);
  const started = Date.now();

  const apiKey = process.env[TRIPJACK_API_KEY_SECRET];
  if (!apiKey) {
    return {
      ok: false,
      correlationId,
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
      correlationId,
      error: {
        kind: "capability-unmapped",
        message: `TripJack ${suite} capability "${capability}" has no documented endpoint mapped yet.`,
        correlationId,
      },
    };
  }

  const search = query ? new URLSearchParams(query).toString() : "";
  const url = `${tripjackBaseUrl(suite)}${cap.path}${search ? `?${search}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIPJACK_TIMEOUT_MS);

  // Transport only: route via the static-IP egress relay when configured.
  // Fail closed: a half-configured relay or a route outside the relay allow-list
  // never silently falls back to a direct call.
  const { relayTarget, relayMode, relayAllows } = await import("./relay.server");
  const mode = relayMode();
  if (mode === "partial" || (mode === "on" && !relayAllows(suite, cap.method, cap.path))) {
    clearTimeout(timer);
    return {
      ok: false,
      correlationId,
      error: {
        kind: "not-configured",
        message:
          mode === "partial"
            ? "TripJack UAT relay is only partly configured; call refused."
            : `TripJack ${suite} capability "${capability}" is not on the UAT relay allow-list; call refused.`,
        correlationId,
      },
    };
  }

  try {
    const payload = cap.method === "POST" ? JSON.stringify(body ?? {}) : undefined;
    const relay = await relayTarget(
      suite,
      cap.method,
      `${cap.path}${search ? `?${search}` : ""}`,
      payload ?? "",
    );
    if (mode === "on" && !relay) throw new Error("relay target unavailable");
    const response = await fetch(relay?.url ?? url, {
      method: cap.method,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Correlation-Id": correlationId,
        ...(relay?.headers ?? {}),
      },
      body: payload,
      signal: controller.signal,
    });

    const text = await response.text();
    if (suite === "cabs" && capability === "location-search") {
      // UAT diagnostics: upstream URL, transport, status and body — no credential material.
      console.info(
        "[tripjack] cabs location-search",
        JSON.stringify({
          url,
          via: relay ? "relay" : "direct",
          method: cap.method,
          correlationId,
          status: response.status,
          body: text.slice(0, 2000),
        }),
      );
    }
    let parsed: unknown = null;
    const requestBody = cap.method === "POST" ? (body ?? {}) : undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        const durationMs = Date.now() - started;
        log({
          at: new Date().toISOString(),
          correlationId,
          suite,
          capability,
          path: cap.path,
          status: response.status,
          durationMs,
          outcome: "error",
        });
        await persistEvidence({
          correlationId,
          suite,
          capability,
          method: cap.method,
          path: cap.path,
          query,
          requestBody,
          status: response.status,
          // Non-JSON bodies (e.g. an HTML 404 page) are kept as a truncated string.
          responseBody: {
            nonJson: true,
            contentType: response.headers.get("content-type"),
            text: text.slice(0, 2000),
          },
          durationMs,
          outcome: "error",
          errorKind: "invalid-response",
        });
        return {
          ok: false,
          correlationId,
          error: {
            kind: "invalid-response",
            status: response.status,
            message: "TripJack returned a non-JSON response.",
            correlationId,
          },
        };
      }
    }

    const durationMs = Date.now() - started;
    const entry: TripjackLogEntry = {
      at: new Date().toISOString(),
      correlationId,
      suite,
      capability,
      path: cap.path,
      status: response.status,
      durationMs,
      outcome: response.ok ? "ok" : "error",
      detail: response.ok ? undefined : JSON.stringify(redact(parsed)).slice(0, 2000),
    };
    log(entry);
    await persistEvidence({
      correlationId,
      suite,
      capability,
      method: cap.method,
      path: cap.path,
      query,
      requestBody,
      status: response.status,
      responseBody: parsed,
      durationMs,
      outcome: response.ok ? "ok" : "error",
      errorKind: response.ok ? undefined : "http",
    });

    if (!response.ok) {
      return {
        ok: false,
        correlationId,
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
    const durationMs = Date.now() - started;
    log({
      at: new Date().toISOString(),
      correlationId,
      suite,
      capability,
      path: cap.path,
      status: null,
      durationMs,
      outcome: "error",
    });
    await persistEvidence({
      correlationId,
      suite,
      capability,
      method: cap.method,
      path: cap.path,
      query,
      requestBody: cap.method === "POST" ? (body ?? {}) : undefined,
      status: null,
      responseBody: null,
      durationMs,
      outcome: "error",
      errorKind: aborted ? "timeout" : "network",
    });
    return {
      ok: false,
      correlationId,
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
