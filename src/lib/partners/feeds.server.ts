// Authorised bulk-feed ingestion — server only.
//
// Many luxury operators publish a licensed XML/JSON/CSV catalogue feed rather
// than (or alongside) a REST API. This module pulls or accepts such a feed,
// flattens it, applies the connector's declared `fieldMap`, and hands plain
// records to `normaliseJourney` so feed-sourced and API-sourced journeys are
// identical downstream. Nothing here scrapes a website: a feed must be
// configured with a partner-supplied URL and credentials.
import type { PartnerConnectorConfig, PartnerFeedConfig } from "./types";

// ------------------------------------------------------------------ parsing

/** Tolerant XML → JSON. Handles attributes, repeated elements and CDATA.
 *  Sufficient for catalogue feeds; not a validating parser. */
export function parseXml(xml: string): Record<string, unknown> {
  const clean = xml
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => escapeText(c));

  let index = 0;

  function escapeText(s: string) {
    return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function decode(s: string) {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
  }

  function parseNode(): { name: string; value: unknown } | null {
    const open = clean.indexOf("<", index);
    if (open === -1) return null;
    const close = clean.indexOf(">", open);
    if (close === -1) return null;
    const rawTag = clean.slice(open + 1, close);
    index = close + 1;
    if (rawTag.startsWith("/")) return null;
    const selfClosing = rawTag.endsWith("/");
    const tag = selfClosing ? rawTag.slice(0, -1) : rawTag;
    const nameMatch = /^([\w:.-]+)/.exec(tag);
    const name = nameMatch ? nameMatch[1] : "node";
    const attrs: Record<string, unknown> = {};
    for (const m of tag.slice(name.length).matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g))
      attrs[m[1]] = decode(m[2]);
    if (selfClosing) return { name, value: Object.keys(attrs).length ? attrs : "" };

    const children: Record<string, unknown> = { ...attrs };
    let text = "";
    for (;;) {
      const next = clean.indexOf("<", index);
      if (next === -1) break;
      text += clean.slice(index, next);
      if (clean.startsWith(`</`, next)) {
        const end = clean.indexOf(">", next);
        index = end === -1 ? clean.length : end + 1;
        break;
      }
      const child = parseNode();
      if (!child) continue;
      const existing = children[child.name];
      if (existing === undefined) children[child.name] = child.value;
      else if (Array.isArray(existing)) (existing as unknown[]).push(child.value);
      else children[child.name] = [existing, child.value];
    }
    const trimmed = decode(text);
    if (Object.keys(children).length === 0) return { name, value: trimmed };
    if (trimmed) children["#text"] = trimmed;
    return { name, value: children };
  }

  const root = parseNode();
  if (!root) return {};
  return { [root.name]: root.value };
}

/** Minimal RFC-4180 CSV → records, using the header row as field names. */
export function parseCsv(csv: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// ------------------------------------------------------------------ mapping

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      source,
    );
}

function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

/** Applies a connector's declared field map to one raw feed record. */
export function mapFeedRecord(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(fieldMap)) {
    const value = readPath(raw, from);
    if (value === undefined || value === "") continue;
    writePath(out, to, value);
  }
  // Preserve anything the map does not cover so normalisation can still use it.
  for (const [key, value] of Object.entries(raw)) if (!(key in out)) out[`_${key}`] = value;
  return out;
}

/** Locate the repeated record node inside a parsed feed document. */
export function extractRecords(doc: unknown, recordPath: string): Record<string, unknown>[] {
  const wanted = recordPath.split(".").pop() ?? recordPath;
  const found: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === wanted) {
        if (Array.isArray(value)) {
          for (const v of value) if (v && typeof v === "object") found.push(v as never);
        } else if (value && typeof value === "object") {
          found.push(value as never);
        }
      }
      walk(value);
    }
  }
  walk(doc);
  return found;
}

export interface FeedFetchResult {
  ok: boolean;
  records: Record<string, unknown>[];
  status: number;
  durationMs: number;
  error?: string;
}

function absoluteUrl(cfg: PartnerConnectorConfig, feed: PartnerFeedConfig) {
  return feed.url.startsWith("http") ? feed.url : `${cfg.baseUrl}${feed.url}`;
}

/** Parse a feed payload of any supported format into mapped records. */
export function parseFeedPayload(feed: PartnerFeedConfig, payload: string) {
  let records: Record<string, unknown>[] = [];
  if (feed.format === "csv") records = parseCsv(payload);
  else if (feed.format === "xml") records = extractRecords(parseXml(payload), feed.recordPath);
  else {
    const json: unknown = JSON.parse(payload);
    records = Array.isArray(json)
      ? (json as Record<string, unknown>[])
      : extractRecords(json, feed.recordPath);
  }
  return records.map((r) => mapFeedRecord(r, feed.fieldMap));
}

/** Pull an authorised partner feed and return mapped, unnormalised records. */
export async function fetchFeed(cfg: PartnerConnectorConfig): Promise<FeedFetchResult> {
  const started = Date.now();
  const feed = cfg.feed;
  if (!feed)
    return { ok: false, records: [], status: 0, durationMs: 0, error: "No feed configured" };

  const headers: Record<string, string> = { Accept: "*/*" };
  const [primary] = cfg.auth.secrets.map((s) => process.env[s] ?? "");
  if (cfg.auth.kind === "api-key-header" && cfg.auth.header && primary)
    headers[cfg.auth.header] = primary;
  if (cfg.auth.kind === "bearer-token" && primary) headers.Authorization = `Bearer ${primary}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    const res = await fetch(absoluteUrl(cfg, feed), { headers, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok)
      return {
        ok: false,
        records: [],
        status: res.status,
        durationMs: Date.now() - started,
        error: `HTTP ${res.status}`,
      };
    return {
      ok: true,
      records: parseFeedPayload(feed, text),
      status: res.status,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      records: [],
      status: 0,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Feed fetch failed",
    };
  }
}
