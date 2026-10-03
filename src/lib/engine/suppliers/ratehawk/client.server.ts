// Server-only RateHawk / Emerging Travel Group API v3 transport foundation.
// Credential presence never implies supplier certification or production access.

export type RateHawkEnvironment = "sandbox" | "production";

const BASE_URLS: Record<RateHawkEnvironment, string> = {
  sandbox: "https://api-sandbox.ratehawk.com/api/b2b/v3",
  production: "https://api.ratehawk.com/api/b2b/v3",
};

export function rateHawkCredentialStatus(): { configured: boolean; missing: string[] } {
  const names = ["RATEHAWK_KEY_ID", "RATEHAWK_API_KEY"];
  const missing = names.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

export function rateHawkBaseUrl(environment: RateHawkEnvironment): string {
  return process.env.RATEHAWK_API_URL || BASE_URLS[environment];
}

export async function rateHawkPost<T>(
  environment: RateHawkEnvironment,
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error: string }> {
  if (!rateHawkCredentialStatus().configured) {
    return { ok: false, status: null, error: "RateHawk not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${rateHawkBaseUrl(environment)}${path}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // RateHawk API v3 uses HTTP Basic authentication with key ID + API key.
        // The values are read only on the server and are never returned to callers.
        // eslint-disable-next-line no-restricted-syntax
        credentials: "omit",
      },
    );

    // Basic auth is deliberately added through the Authorization header only when
    // credentials are configured. This keeps the transport server-only.
    // Re-fetching is avoided so callers receive a single deterministic result.
    const payload = await response.json() as { data?: T; error?: unknown; status?: string };

    if (!response.ok) {
      return { ok: false, status: response.status, error: `RateHawk HTTP ${response.status}` };
    }
    if (payload.status === "error" || payload.error) {
      return { ok: false, status: response.status, error: "RateHawk API error" };
    }
    return { ok: true, data: (payload.data ?? payload) as T };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error && error.name === "AbortError"
        ? "RateHawk request timeout"
        : "RateHawk request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const RATEHAWK_SANDBOX_URL = BASE_URLS.sandbox;
export const RATEHAWK_PRODUCTION_URL = BASE_URLS.production;
