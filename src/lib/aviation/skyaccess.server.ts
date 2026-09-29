// Server-only SkyAccess adapter — official public MCP server (Streamable HTTP),
// listed on the Official MCP Registry as com.skyaccess/skyaccess. No API key.
// Only read-only tools are used. `request_booking` (sends customer contact data
// to the partner) and `booking_handoff` (partner-branded link) are deliberately
// NOT wired: Worldway's aviation desk owns every customer handoff.
// Nothing here is returned raw to browsers — callers normalise first.

const MCP_URL = "https://api.skyaccess.com/mcp";
const TIMEOUT_MS = 20_000;

async function parseRpc(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    const last = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean)
      .pop();
    return last ? JSON.parse(last) : null;
  }
  return text ? JSON.parse(text) : null;
}

async function post(body: unknown, session?: string | null) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(session ? { "Mcp-Session-Id": session } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { json: await parseRpc(res), session: res.headers.get("mcp-session-id") ?? session ?? null };
  } finally {
    clearTimeout(t);
  }
}

const READ_ONLY_TOOLS = new Set(["get_charter_estimate", "search_empty_legs", "get_flight"]);

export async function callSkyAccess(name: string, args: Record<string, unknown>): Promise<any> {
  if (!READ_ONLY_TOOLS.has(name)) throw new Error("Tool not enabled");
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "worldway", version: "1.0" } },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, init.session).catch(() => undefined);
  const r = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, init.session);
  const result = r.json?.result;
  if (!result || result.isError) throw new Error("Tool error");
  const text = (result.content ?? []).find((c: any) => c.type === "text")?.text ?? "";
  return result.structuredContent ?? JSON.parse(text);
}

export type SkyEstimate = { category: string; currency: "USD"; low: number; high: number; durationMin: number | null };

const CATEGORY_LABEL: Record<string, string> = {
  PISTON: "Piston",
  TURBOPROP: "Turboprop",
  VERY_LIGHT_JET: "Very light jet",
  LIGHT_JET: "Light jet",
  MID_SIZE_JET: "Midsize jet",
  SUPER_MID_SIZE_JET: "Super midsize jet",
  HEAVY_JET: "Heavy jet",
  ULTRA_LONG_RANGE: "Ultra long range",
  AIRLINER: "VIP airliner",
};

/** Normalises the estimate response; drops anything without a positive numeric range. */
export function normaliseSkyEstimate(structured: any): SkyEstimate[] {
  const list = Array.isArray(structured?.byCategory) ? structured.byCategory : [];
  return list
    .map((e: any) => ({
      category: CATEGORY_LABEL[String(e.aircraftCategory)] ?? String(e.aircraftCategory ?? "Private jet"),
      currency: "USD" as const,
      low: Number(e.estimateUsd?.min),
      high: Number(e.estimateUsd?.max),
      durationMin: Number.isFinite(Number(e.flightDurationMinutes)) ? Number(e.flightDurationMinutes) : null,
    }))
    .filter((e: SkyEstimate) => Number.isFinite(e.low) && Number.isFinite(e.high) && e.low > 0 && e.high >= e.low)
    .filter((e: SkyEstimate) => e.category !== "Piston");
}

export async function skyCharterEstimate(args: { origin: string; destination: string; passengers: number }) {
  const s = await callSkyAccess("get_charter_estimate", args);
  return normaliseSkyEstimate(s);
}
