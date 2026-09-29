// Server-only private aviation supplier client (MCP over Streamable HTTP + RSS feed).
// Credentials come only from VILLIERS_MCP_URL / VILLIERS_MCP_TOKEN / VILLIERS_RSS_FEED_URL.
// Nothing here is ever returned raw to the browser: callers normalise first.

const TIMEOUT_MS = 20_000;

function cfg() {
  const url = process.env["VILLIERS_MCP_URL"];
  const token = process.env["VILLIERS_MCP_TOKEN"];
  if (!url || !token) throw new Error("Private aviation service is not configured");
  return { url, token };
}

function headers(token: string, session?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (session) h["Mcp-Session-Id"] = session;
  return h;
}

async function parseRpc(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines.map((l) => l.slice(5).trim()).filter(Boolean).pop();
    return last ? JSON.parse(last) : null;
  }
  return text ? JSON.parse(text) : null;
}

async function post(body: unknown, session?: string | null) {
  const { url, token } = cfg();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: headers(token, session),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function openSession(): Promise<string | null> {
  const res = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "worldway-private-aviation", version: "1.0.0" },
    },
  });
  if (!res.ok) throw new Error(`Aviation service unavailable (${res.status})`);
  await parseRpc(res);
  const session = res.headers.get("mcp-session-id");
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, session).catch(() => null);
  return session;
}

export type ToolResult = { structured: any; text: string; isError: boolean };

/** Calls a tool. `retry` only for read-only tools — never for request_jet_confirmation. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  opts: { session?: string | null; retry?: boolean } = {},
): Promise<ToolResult & { session: string | null }> {
  const attempts = opts.retry ? 3 : 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const session = opts.session ?? (await openSession());
      const res = await post(
        { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } },
        session,
      );
      if (!res.ok) throw new Error(`Aviation service error (${res.status})`);
      const json = await parseRpc(res);
      if (json?.error) throw new Error(String(json.error.message ?? "Aviation service error"));
      const r = json?.result ?? {};
      const text = (r.content ?? [])
        .map((c: any) => (c?.type === "text" ? c.text : ""))
        .join("\n");
      return { structured: r.structuredContent ?? null, text, isError: !!r.isError, session };
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Aviation service error");
}

// ---------------- RSS empty-leg feed ----------------

export type FeedLeg = {
  id: string;
  aircraft: string;
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string | null;
  arrivalTime: string | null;
  duration: string | null;
  price: number | null;
  currency: string;
  seats: number | null;
  trackingLink: string; // server-only
};

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<villiers:${name}>([\\s\\S]*?)</villiers:${name}>`));
  return m ? decode(m[1].trim()) : null;
}
function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function splitAirport(v: string | null) {
  if (!v) return { code: "", name: "" };
  const i = v.indexOf(" - ");
  return i > 0 ? { code: v.slice(0, i).trim(), name: v.slice(i + 3).trim() } : { code: "", name: v };
}
function parseDate(v: string | null): string {
  const m = v?.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return "";
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : "";
}
function parsePrice(v: string | null): { price: number | null; currency: string } {
  if (!v) return { price: null, currency: "USD" };
  const currency = v.includes("£") ? "GBP" : v.includes("€") ? "EUR" : "USD";
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return { price: Number.isFinite(n) && n > 0 ? n : null, currency };
}
async function hashId(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return "WEL-" + Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

let cache: { at: number; legs: FeedLeg[] } | null = null;
const CACHE_MS = 5 * 60_000;
const MAX_PAGES = 6;

export async function fetchFeedLegs(force = false): Promise<FeedLeg[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.legs;
  let next: string | null = process.env["VILLIERS_RSS_FEED_URL"] ?? null;
  if (!next) throw new Error("Empty-leg feed is not configured");
  const out: FeedLeg[] = [];
  const seen = new Set<string>();
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let xml: string;
    try {
      const res = await fetch(next, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Empty-leg feed unavailable (${res.status})`);
      xml = await res.text();
    } finally {
      clearTimeout(t);
    }
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    for (const it of items) {
      const link = tag(it, "trackingLink") ?? decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      if (!link || seen.has(link)) continue;
      seen.add(link);
      const o = splitAirport(tag(it, "originAirport"));
      const d = splitAirport(tag(it, "destinationAirport"));
      const p = parsePrice(tag(it, "price"));
      const seats = Number(tag(it, "seatsAvailable"));
      out.push({
        id: await hashId(link),
        aircraft: tag(it, "aircraftType") ?? "Private jet",
        originCode: o.code, originName: o.name,
        destinationCode: d.code, destinationName: d.name,
        departureDate: parseDate(tag(it, "departureDate")),
        departureTime: tag(it, "departureTime"),
        arrivalTime: tag(it, "arrivalTime"),
        duration: tag(it, "flightDuration"),
        price: p.price, currency: p.currency,
        seats: Number.isFinite(seats) ? seats : null,
        trackingLink: link,
      });
    }
    const nm = xml.match(/<atom:link[^>]*rel="next"[^>]*href="([^"]+)"/);
    next = nm && items.length ? decode(nm[1]) : null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const legs = out.filter((l) => !l.departureDate || l.departureDate >= today);
  cache = { at: Date.now(), legs };
  return legs;
}

/** Map supplier trip stage text to Worldway status. */
export function mapStage(stage: string | null | undefined): string {
  const s = (stage ?? "").toLowerCase();
  if (s.includes("close") || s.includes("lost") || s.includes("no booking") || s.includes("cancel")) return "closed";
  if (s.includes("book")) return "booked";
  if (s.includes("sent") || s.includes("option")) return "options_sent";
  return "sourcing";
}
