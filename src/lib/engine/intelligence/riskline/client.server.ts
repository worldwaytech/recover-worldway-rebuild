// Server-only Riskline TripReady client foundation.
// Risk data is intelligence evidence, not booking authority.

const API_URL = process.env.RISKLINE_API_URL || "https://api.riskline.com/ext/v1/trip-ready";

export function risklineCredentialStatus(): { configured: boolean; missing: string[] } {
  const missing = ["RISKLINE_API_TOKEN"].filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

export interface TripReadyRequest {
  origin: string;
  destination: string;
  from: string;
  to: string;
  language: string;
}

export async function fetchTripReady<T>(
  request: TripReadyRequest,
  timeoutMs = 10_000,
): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error: string }> {
  if (!risklineCredentialStatus().configured) {
    return { ok: false, status: null, error: "Riskline not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RISKLINE_API_TOKEN}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "trip-ready",
          attributes: request,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, status: response.status, error: `Riskline HTTP ${response.status}` };
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error && error.name === "AbortError" ? "Riskline request timeout" : "Riskline request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export const RISKLINE_TRIP_READY_URL = API_URL;
