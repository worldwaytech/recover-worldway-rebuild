// Server-only Travelgate credential and GraphQL transport foundation.
// Credential presence never implies production certification.

const API_URL = process.env.TRAVELGATE_API_URL || "https://api.travelgate.com";

export function travelgateCredentialStatus(): { configured: boolean; missing: string[] } {
  const names = ["TRAVELGATE_API_KEY", "TRAVELGATE_CLIENT"];
  const missing = names.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

export async function travelgateGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error: string }> {
  if (!travelgateCredentialStatus().configured) {
    return { ok: false, status: null, error: "Travelgate not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Apikey ${process.env.TRAVELGATE_API_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const payload = await response.json() as { data?: T; errors?: { message?: string }[] };
    if (!response.ok) return { ok: false, status: response.status, error: `Travelgate HTTP ${response.status}` };
    if (payload.errors?.length) return { ok: false, status: response.status, error: payload.errors[0]?.message || "Travelgate GraphQL error" };
    if (!payload.data) return { ok: false, status: response.status, error: "Travelgate returned no data" };
    return { ok: true, data: payload.data };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error && error.name === "AbortError" ? "Travelgate request timeout" : "Travelgate request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export const TRAVELGATE_API_URL = API_URL;
