// Server-only Marketplace / Channel-Manager sync for the Tours Marketplace.
// Uses ONLY documented Bókun REST v1 endpoints:
//   GET /activity.json/active-ids     — every supplier + product the account may sell
//   GET /product-list.json/list       — product lists (contracted collections)
//   GET /product-list.json/{id}       — products inside a list
//   GET /activity.json/list-updated   — incremental change feed (fromDate, UTC)
//   GET /activity.json/list-by-id     — batch product content
// Suppliers are keyed by Bókun supplierId; products by activity id (unique),
// so a product reachable via several suppliers/lists is stored exactly once.

import { createHash } from "node:crypto";
import { BokunError, activeEnvironment, bokunFetch } from "./client.server";

export const BOKUN_SYNC_ENDPOINTS = {
  activeIds: "/activity.json/active-ids",
  listUpdated: "/activity.json/list-updated",
  listById: "/activity.json/list-by-id",
  productLists: "/product-list.json/list",
  productList: "/product-list.json/{id}",
} as const;

const BATCH = 50;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface DiscoveredSupplier {
  supplierId: string;
  activityIds: string[];
}

export function parseActiveIds(raw: unknown): DiscoveredSupplier[] {
  const list = isRec(raw) && Array.isArray(raw["suppliers"]) ? (raw["suppliers"] as unknown[]) : [];
  return list.filter(isRec).map((sup) => ({
    supplierId: String(sup["supplierId"] ?? ""),
    activityIds: (Array.isArray(sup["activityIds"]) ? sup["activityIds"] : []).map(String).filter((x) => /^\d+$/.test(x)),
  })).filter((x) => /^\d+$/.test(x.supplierId));
}

function photoUrl(p: unknown): string | null {
  if (!isRec(p)) return null;
  const d = p["derived"];
  if (Array.isArray(d)) {
    const large = d.filter(isRec).find((x) => x["name"] === "large") ?? d.filter(isRec)[0];
    if (large && s(large["url"])) return s(large["url"]);
  }
  if (isRec(d) && s(d["original"])) return s(d["original"]);
  return s(p["originalUrl"]) ?? s(p["url"]);
}

export interface MappedProduct {
  product_id: string;
  supplier_id: string | null;
  vendor_title: string | null;
  title: string;
  summary: string | null;
  city: string | null;
  country: string | null;
  duration_text: string | null;
  price_from: number | null;
  currency: string | null;
  cover_photo: string | null;
  photos: string[];
  pricing: Rec;
  cancellation_policy: Rec | null;
  content: Rec;
  fingerprint: string;
}

/** Maps an ActivityDto (REST v1) into the Worldway catalogue row. */
export function mapActivity(raw: Rec, supplierHint: string | null): MappedProduct {
  const vendor = isRec(raw["vendor"]) ? raw["vendor"] : {};
  const place = isRec(raw["googlePlace"]) ? raw["googlePlace"] : isRec(raw["location"]) ? raw["location"] : {};
  const money = isRec(raw["nextDefaultPriceMoney"]) ? raw["nextDefaultPriceMoney"] : {};
  const photos = [raw["keyPhoto"], ...(Array.isArray(raw["photos"]) ? raw["photos"] : [])]
    .map(photoUrl)
    .filter((u): u is string => !!u);
  const unique = Array.from(new Set(photos));
  const cp = isRec(raw["cancellationPolicy"]) ? raw["cancellationPolicy"] : null;
  const row = {
    product_id: String(raw["id"]),
    supplier_id: vendor["id"] != null ? String(vendor["id"]) : supplierHint,
    vendor_title: s(vendor["title"]),
    title: s(raw["title"]) ?? "Untitled tour",
    summary: s(raw["excerpt"]) ?? s(raw["summary"]),
    city: s(place["city"]),
    country: s(place["country"]) ?? s(place["countryCode"]),
    duration_text: s(raw["durationText"]),
    price_from: n(money["amount"]) ?? n(raw["nextDefaultPrice"]),
    currency: s(money["currency"]),
    cover_photo: unique[0] ?? null,
    photos: unique,
    pricing: {
      pricingCategories: raw["pricingCategories"] ?? [],
      rates: raw["rates"] ?? [],
      defaultRateId: raw["defaultRateId"] ?? null,
    },
    cancellation_policy: cp
      ? { id: cp["id"] ?? null, title: cp["title"] ?? null, penaltyRules: cp["penaltyRules"] ?? [] }
      : null,
    content: {
      description: raw["description"] ?? null,
      included: raw["included"] ?? null,
      excluded: raw["excluded"] ?? null,
      requirements: raw["requirements"] ?? null,
      attention: raw["attention"] ?? null,
      languages: raw["guidanceTypes"] ?? raw["languages"] ?? [],
      bookingType: raw["bookingType"] ?? null,
      categories: raw["activityCategories"] ?? [],
    },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(row)).digest("hex");
  return { ...row, fingerprint };
}

export interface MarketplaceSyncResult {
  runId: string | null;
  scope: "full" | "incremental";
  environment: string;
  suppliers: number;
  productLists: number;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  failed: number;
  errors: string[];
}

function errText(e: unknown): string {
  if (e instanceof BokunError) return `${e.status || "network"}: ${e.message}`;
  return e instanceof Error ? e.message : "unknown error";
}

export async function runMarketplaceSync(opts: {
  scope: "full" | "incremental";
  trigger: "manual" | "auto";
}): Promise<MarketplaceSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const environment = activeEnvironment();
  const errors: string[] = [];
  const res: MarketplaceSyncResult = {
    runId: null, scope: opts.scope, environment, suppliers: 0, productLists: 0, discovered: 0,
    created: 0, updated: 0, unchanged: 0, deactivated: 0, failed: 0, errors,
  };

  // Previous successful run (incremental baseline).
  let since: string | null = null;
  if (opts.scope === "incremental") {
    const { data } = await db.from("bokun_sync_runs").select("started_at")
      .in("status", ["success", "partial"]).order("started_at", { ascending: false }).limit(1);
    since = data?.[0]?.started_at ?? null;
    if (!since) res.scope = "full";
  }

  const { data: run } = await db.from("bokun_sync_runs")
    .insert({ scope: res.scope, trigger: opts.trigger, environment }).select("id").single();
  res.runId = run?.id ?? null;

  // 1. Discovery: suppliers + authorised product ids.
  let suppliers: DiscoveredSupplier[] = [];
  try {
    suppliers = parseActiveIds(await bokunFetch(BOKUN_SYNC_ENDPOINTS.activeIds));
  } catch (e) {
    errors.push(`discovery: ${errText(e)}`);
  }
  const owner = new Map<string, string>();
  for (const sup of suppliers) for (const id of sup.activityIds) if (!owner.has(id)) owner.set(id, sup.supplierId);

  // 2. Product lists (contracted collections) — extra ids + graceful per-list failure.
  try {
    const lists = await bokunFetch<unknown[]>(BOKUN_SYNC_ENDPOINTS.productLists);
    const flat: Rec[] = [];
    const walk = (arr: unknown) => Array.isArray(arr) && arr.filter(isRec).forEach((l) => { flat.push(l); walk(l["children"]); });
    walk(lists);
    res.productLists = flat.length;
    for (const l of flat) {
      const id = String(l["id"] ?? "");
      if (!/^\d+$/.test(id)) continue;
      try {
        const detail = await bokunFetch<Rec>(BOKUN_SYNC_ENDPOINTS.productList.replace("{id}", id));
        const items = Array.isArray(detail?.["items"]) ? (detail["items"] as unknown[]) : [];
        for (const it of items.filter(isRec)) {
          const act = isRec(it["activity"]) ? it["activity"] : it;
          const aid = String(act["id"] ?? "");
          if (/^\d+$/.test(aid) && !owner.has(aid)) owner.set(aid, "");
        }
      } catch (e) {
        errors.push(`product-list ${id}: ${errText(e)}`);
      }
    }
  } catch (e) {
    errors.push(`product-lists: ${errText(e)}`);
  }

  // 3. Persist suppliers (authorised vs not).
  const now = new Date().toISOString();
  res.suppliers = suppliers.length;
  if (suppliers.length) {
    await db.from("bokun_suppliers").upsert(
      suppliers.map((sp) => ({
        supplier_id: sp.supplierId, product_count: sp.activityIds.length,
        status: sp.activityIds.length ? "authorized" : "no_products", last_error: null, last_seen_at: now,
      })),
      { onConflict: "supplier_id" },
    );
  }

  // 4. Which products to fetch.
  let targets = Array.from(owner.keys());
  if (res.scope === "incremental" && since) {
    try {
      const upd = await bokunFetch<Rec>(`${BOKUN_SYNC_ENDPOINTS.listUpdated}?fromDate=${encodeURIComponent(since.slice(0, 19))}`);
      const changed = new Set(
        (Array.isArray(upd?.["updatedProducts"]) ? (upd["updatedProducts"] as unknown[]) : [])
          .filter(isRec).map((u) => String(u["productId"])),
      );
      targets = targets.filter((id) => changed.has(id));
    } catch (e) {
      errors.push(`list-updated: ${errText(e)}`);
    }
  }
  res.discovered = owner.size;

  const { data: existingRows } = await db.from("bokun_products").select("product_id, fingerprint, active");
  const existing = new Map<string, { fingerprint: string | null; active: boolean }>(
    (existingRows ?? []).map((r: { product_id: string; fingerprint: string | null; active: boolean }) => [r.product_id, r]),
  );

  // 5. Batch-fetch content and upsert (dedup by product_id).
  for (let i = 0; i < targets.length; i += BATCH) {
    const ids = targets.slice(i, i + BATCH);
    try {
      const list = await bokunFetch<unknown[]>(`${BOKUN_SYNC_ENDPOINTS.listById}?ids=${ids.join(",")}`);
      const rows = (Array.isArray(list) ? list : []).filter(isRec).map((a) => mapActivity(a, owner.get(String(a["id"])) || null));
      const changed = rows.filter((r) => {
        const prev = existing.get(r.product_id);
        if (!prev) { res.created += 1; return true; }
        if (prev.fingerprint !== r.fingerprint || !prev.active) { res.updated += 1; return true; }
        res.unchanged += 1;
        return false;
      });
      if (changed.length) {
        const { error } = await db.from("bokun_products").upsert(
          changed.map((r) => ({ ...r, active: true, synced_at: now })), { onConflict: "product_id" },
        );
        if (error) { res.failed += changed.length; errors.push("database upsert failed"); }
      }
      res.failed += ids.length - rows.length;
    } catch (e) {
      res.failed += ids.length;
      errors.push(`list-by-id batch ${i / BATCH + 1}: ${errText(e)}`);
    }
  }

  // 6. Full sync only: deactivate products no longer authorised (never delete).
  const discoveryOk = !errors.some((e) => e.startsWith("discovery"));
  if (res.scope === "full" && discoveryOk) {
    const gone = Array.from(existing.entries()).filter(([id, r]) => r.active && !owner.has(id)).map(([id]) => id);
    if (gone.length) {
      await db.from("bokun_products").update({ active: false }).in("product_id", gone);
      res.deactivated = gone.length;
    }
  }

  const status = !discoveryOk ? "failed" : errors.length ? "partial" : "success";
  if (res.runId) {
    await db.from("bokun_sync_runs").update({
      status, suppliers: res.suppliers, product_lists: res.productLists, discovered: res.discovered,
      created_count: res.created, updated_count: res.updated, unchanged_count: res.unchanged,
      deactivated_count: res.deactivated, failed_count: res.failed, errors: errors.slice(0, 50),
      finished_at: new Date().toISOString(),
    }).eq("id", res.runId);
  }
  return res;
}

export async function marketplaceOverview() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [sup, act, inact, runs] = await Promise.all([
    db.from("bokun_suppliers").select("supplier_id, title, product_count, status, last_error, last_seen_at").order("supplier_id"),
    db.from("bokun_products").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("bokun_products").select("id", { count: "exact", head: true }).eq("active", false),
    db.from("bokun_sync_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);
  const { data: lists } = await Promise.resolve({ data: runs.data?.[0]?.product_lists ?? 0 });
  const last = runs.data?.[0];
  const health = !last ? "never_synced" : last.status === "success" ? "healthy" : last.status === "partial" ? "degraded" : last.status === "running" ? "running" : "failing";
  return {
    environment: activeEnvironment(),
    health,
    suppliers: sup.data ?? [],
    productLists: lists as number,
    activeProducts: act.count ?? 0,
    inactiveProducts: inact.count ?? 0,
    runs: runs.data ?? [],
  };
}
