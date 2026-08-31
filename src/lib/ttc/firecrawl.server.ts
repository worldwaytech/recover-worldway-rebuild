// Firecrawl content client for the approved TTC website source — SERVER ONLY.
//
// Used to discover and extract TTC tour content that is not available through
// the official API while API access is pending. The key is read from the server
// runtime only and never returned to the browser.

import { TTC_CONTENT } from "./config";

const DIRECT_BASE = "https://api.firecrawl.dev/v2";
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/firecrawl/v2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function credentials(): { base: string; headers: Record<string, string> } {
  const key = process.env["FIRECRAWL_API_KEY"]?.trim();
  if (!key) {
    throw new Error(
      "Firecrawl is not connected. Connect the Firecrawl connector to import approved TTC website content.",
    );
  }
  // Gateway-backed connections issue Lovable connection keys (lovc_*).
  if (key.startsWith("lovc_")) {
    const lovable = process.env["LOVABLE_API_KEY"]?.trim();
    if (!lovable) throw new Error("LOVABLE_API_KEY is required for gateway-backed Firecrawl calls.");
    return {
      base: GATEWAY_BASE,
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": key,
        "Content-Type": "application/json",
      },
    };
  }
  return {
    base: DIRECT_BASE,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

export function firecrawlConfigured(): boolean {
  return Boolean(process.env["FIRECRAWL_API_KEY"]?.trim());
}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const { base, headers } = credentials();
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= TTC_CONTENT.maxRetries) {
    attempt += 1;
    try {
      const response = await fetch(`${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const waitMs = retryAfter > 0 ? (retryAfter < 1000 ? retryAfter * 1000 : retryAfter) : 5000;
        await sleep(Math.min(waitMs, 60000));
        continue;
      }
      if (!response.ok) {
        const body = await response.text();
        if (response.status >= 500 && attempt <= TTC_CONTENT.maxRetries) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(`Firecrawl request failed [${response.status}] ${path}: ${body.slice(0, 400)}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt > TTC_CONTENT.maxRetries) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Firecrawl request failed");
}

export interface FirecrawlMapResult {
  success?: boolean;
  links?: (string | { url?: string })[];
}

export async function firecrawlMap(
  url: string,
  options: { search?: string; limit?: number; includeSubdomains?: boolean } = {},
): Promise<string[]> {
  const result = await call<FirecrawlMapResult>("/map", {
    method: "POST",
    body: {
      url,
      limit: options.limit ?? TTC_CONTENT.mapLimit,
      includeSubdomains: options.includeSubdomains ?? false,
      ...(options.search ? { search: options.search } : {}),
    },
  });
  const links = result.links ?? [];
  return links
    .map((entry) => (typeof entry === "string" ? entry : entry?.url))
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export interface FirecrawlDocument {
  markdown?: string;
  json?: Record<string, unknown>;
  links?: string[];
  metadata?: Record<string, unknown> & { sourceURL?: string; ogImage?: string; title?: string };
}

export async function firecrawlScrape(
  url: string,
  formats: unknown[],
  extra: Record<string, unknown> = {},
): Promise<FirecrawlDocument> {
  const result = await call<{ data?: FirecrawlDocument } & FirecrawlDocument>("/scrape", {
    method: "POST",
    body: { url, formats, ...extra },
  });
  return (result.data ?? result) as FirecrawlDocument;
}

export interface FirecrawlBatchStatus {
  status?: string;
  completed?: number;
  total?: number;
  next?: string | null;
  data?: FirecrawlDocument[];
  error?: string;
}

/** Starts a batch extraction job and returns its id. */
export async function firecrawlBatchStart(
  urls: string[],
  formats: unknown[],
  extra: Record<string, unknown> = {},
): Promise<string> {
  const result = await call<{ id?: string; success?: boolean; error?: string }>("/batch/scrape", {
    method: "POST",
    body: { urls, formats, ...extra },
  });
  if (!result.id) throw new Error(`Firecrawl batch job was not accepted: ${result.error ?? "no job id"}`);
  return result.id;
}

/** Polls a batch job to completion, honouring the configured timeout. */
export async function firecrawlBatchWait(jobId: string): Promise<FirecrawlDocument[]> {
  const deadline = Date.now() + TTC_CONTENT.batchTimeoutMs;
  const documents: FirecrawlDocument[] = [];
  let cursorPath = `/batch/scrape/${jobId}`;

  while (Date.now() < deadline) {
    const status = await call<FirecrawlBatchStatus>(cursorPath);
    if (status.data?.length) documents.push(...status.data);
    const state = (status.status ?? "").toLowerCase();
    if (state === "failed" || state === "cancelled") {
      throw new Error(`Firecrawl batch ${jobId} ${state}: ${status.error ?? "no detail"}`);
    }
    if (state === "completed") {
      if (status.next) {
        const nextUrl = new URL(status.next);
        cursorPath = `${nextUrl.pathname.replace(/^\/v2/, "")}${nextUrl.search}`;
        continue;
      }
      return documents;
    }
    await sleep(TTC_CONTENT.pollIntervalMs);
  }
  throw new Error(`Firecrawl batch ${jobId} did not complete within the configured timeout.`);
}
