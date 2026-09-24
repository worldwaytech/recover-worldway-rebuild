/**
 * Server-only client for the activity supplier's MERCHANT sandbox.
 *
 * Hard isolation from the existing production integration:
 *  - the base URL is a compile-time constant pointing at the sandbox host only;
 *  - the credential is the dedicated sandbox key (VIATOR_SANDBOX_API_KEY);
 *  - there is no environment switch here — this module can never call production.
 *
 * Merchant model: we collect the customer payment ourselves, so the sandbox
 * booking chain uses NO paymentDataSubmissionMode and NO payment session token
 * (the sandbox rejects those fields — verified against the live sandbox).
 */

export const MERCHANT_SANDBOX_BASE = "https://api.sandbox.viator.com/partner";

export const MERCHANT_DEFAULT_TIMEOUT_MS = 15_000;
/** Booking calls may take up to 120s; a timeout is NOT a failure — status is authoritative. */
export const MERCHANT_BOOKING_TIMEOUT_MS = 120_000;

export function merchantConfigured(): boolean {
  return Boolean(process.env["VIATOR_SANDBOX_API_KEY"]);
}

export type MerchantFetchResult<T> = {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
  timedOut?: boolean;
};

/** Customer-safe error text — never leaks supplier internals beyond its message. */
function safeError(status: number, message?: string): string {
  if (status === 401 || status === 403) return "Supplier authentication failed.";
  if (status === 429) return "The supplier is busy — please retry in a moment.";
  return message ?? `Supplier responded ${status}`;
}

export async function merchantFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<MerchantFetchResult<T>> {
  const key = process.env["VIATOR_SANDBOX_API_KEY"];
  if (!key) return { ok: false, status: 503, error: "Sandbox key not configured." };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? MERCHANT_DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${MERCHANT_SANDBOX_BASE}${path}`, {
      method: init.method,
      headers: {
        "exp-api-key": key,
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg =
        (json as { message?: string } | null)?.message ?? `Supplier responded ${res.status}`;
      return { ok: false, status: res.status, error: safeError(res.status, msg) };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (err) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      status: aborted ? 504 : 502,
      ...(aborted ? { timedOut: true } : {}),
      error: aborted
        ? "The supplier did not respond in time."
        : err instanceof Error
          ? err.message
          : "Network error contacting the supplier.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function pick<T>(obj: unknown, keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k] as T;
  }
  return undefined;
}
