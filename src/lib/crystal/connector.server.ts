// CrystalConnector — server-only supplier connector for the Crystal Cruises
// module. It is provider-agnostic: authentication, endpoints, rate limits,
// cache policy and feed field-mapping come from the connector registry record,
// so a certified Crystal API or an authorised XML/JSON distribution file can be
// activated purely by configuring secrets. Live synchronisation stays disabled
// until those credentials exist — the connector never invents inventory.
import type { CrystalVoyage, CrystalVoyageDay, CrystalFare, SuiteCategory } from "./types";
import { CRYSTAL_SUPPLIER_ID } from "./content";

export interface CrystalAuditEntry {
  at: string;
  action:
    | "sync"
    | "health"
    | "booking-request"
    | "amendment"
    | "cancellation"
    | "webhook"
    | "error";
  ok: boolean;
  detail: string;
  durationMs?: number;
}

const AUDIT: CrystalAuditEntry[] = [];

export function crystalAudit(limit = 40): CrystalAuditEntry[] {
  return AUDIT.slice(-limit).reverse();
}

function log(entry: CrystalAuditEntry) {
  AUDIT.push(entry);
  if (AUDIT.length > 300) AUDIT.splice(0, AUDIT.length - 300);
}

function suiteOf(raw: string | undefined): SuiteCategory {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("residence")) return "residence";
  if (v.includes("penthouse")) return "penthouse";
  if (v.includes("expedition")) return "expedition-suite";
  if (v.includes("veranda") || v.includes("balcon")) return "balcony";
  return "ocean-view";
}

/** Normalise one licensed supplier record into the platform voyage model. */
export function normaliseVoyage(record: Record<string, unknown>): CrystalVoyage | null {
  const get = (k: string) => record[k];
  const code = String(get("code") ?? get("voyageCode") ?? "").trim();
  const title = String(get("title") ?? get("voyageName") ?? "").trim();
  if (!code || !title) return null;
  const itinerary = Array.isArray(get("itinerary"))
    ? (get("itinerary") as Record<string, unknown>[]).map((d, i) => ({
        day: Number(d.day ?? i + 1),
        date: d.date ? String(d.date) : undefined,
        port: String(d.port ?? d.name ?? "At sea"),
        country: d.country ? String(d.country) : undefined,
        arrive: d.arrive ? String(d.arrive) : undefined,
        depart: d.depart ? String(d.depart) : undefined,
        summary: d.summary ? String(d.summary) : undefined,
      }))
    : ([] as CrystalVoyageDay[]);
  const fares: CrystalFare[] = Array.isArray(get("fares"))
    ? (get("fares") as Record<string, unknown>[]).map((f) => ({
        suiteCategory: suiteOf(f.suiteCategory as string | undefined),
        gradeId: f.gradeId ? String(f.gradeId) : undefined,
        price: Number(f.price ?? 0),
        currency: String(f.currency ?? get("currency") ?? "USD"),
        available: f.available === undefined ? undefined : Boolean(f.available),
        promotion: f.promotion ? String(f.promotion) : undefined,
      }))
    : [];
  const prices = fares.map((f) => f.price).filter((n) => n > 0);
  return {
    code,
    title,
    subtitle: String(get("subtitle") ?? get("marketingBlurb") ?? ""),
    shipSlug: String(get("shipSlug") ?? get("shipName") ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    shipName: String(get("shipName") ?? get("vessel") ?? ""),
    destinationSlug: String(get("destinationSlug") ?? get("destination") ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    destinationName: String(get("destinationName") ?? get("destination") ?? ""),
    region: String(get("region") ?? ""),
    countries: Array.isArray(get("countries")) ? (get("countries") as string[]).map(String) : [],
    embarkPort: String(get("embarkPort") ?? ""),
    disembarkPort: String(get("disembarkPort") ?? get("embarkPort") ?? ""),
    nights: Number(get("nights") ?? get("durationNights") ?? itinerary.length),
    departureDate: String(get("departureDate") ?? ""),
    returnDate: String(get("returnDate") ?? ""),
    styles: Array.isArray(get("styles")) ? (get("styles") as CrystalVoyage["styles"]) : ["ocean"],
    itinerary,
    fares,
    priceFrom: prices.length ? Math.min(...prices) : undefined,
    currency: String(get("currency") ?? fares[0]?.currency ?? "USD"),
    promotions: Array.isArray(get("promotions")) ? (get("promotions") as string[]).map(String) : [],
    inclusions: Array.isArray(get("inclusions")) ? (get("inclusions") as string[]).map(String) : [],
    media: {
      hero: get("heroImage") ? String(get("heroImage")) : undefined,
      gallery: Array.isArray(get("gallery")) ? (get("gallery") as string[]).map(String) : [],
    },
    availability:
      (String(get("availability") ?? "unknown") as CrystalVoyage["availability"]) ?? "unknown",
    dataSource: "licensed",
    supplierId: CRYSTAL_SUPPLIER_ID,
    updatedAt: String(get("updatedAt") ?? new Date().toISOString()),
  };
}

/** Internal AKTG integration status (AKTG review handoff). */
export const CRYSTAL_SHOPPING_API_STATUS = "PRODUCTION LIVE" as const;
export const CRYSTAL_BOOKING_API_STATUS = "PENDING AKTG" as const;

export interface CrystalConnectorStatus {
  partnerId: string;
  partnerName: string;
  mode: string;
  shoppingApiStatus: string;
  bookingApiStatus: string;
  contractStatus: string;
  authKind: string;
  credentialsRequired: string[];
  credentialsMissing: string[];
  capabilities: string[];
  endpoints: Record<string, string | undefined>;
  feed: {
    format: string;
    recordPath: string;
    mappedFields: number;
    pushEnabled: boolean;
    pushPath: string;
    refreshCron?: string;
  } | null;
  syncEnabled: boolean;
  inventoryCount: number;
  lastSyncAt: string | null;
  health: { ok: boolean; message: string } | null;
  audit: CrystalAuditEntry[];
}

let lastSyncAt: string | null = null;

export async function crystalStatus(includeHealth: boolean): Promise<CrystalConnectorStatus> {
  const { getConnector } = await import("@/lib/partners/registry");
  const { missingSecrets, resolveMode, checkHealth } =
    await import("@/lib/partners/runtime.server");
  const { licensedVoyages } = await import("./inventory");
  const { aktgConfigured, aktgHealth, fetchAktgVoyages } = await import("./aktg.server");
  const cfg = getConnector(CRYSTAL_SUPPLIER_ID);
  if (!cfg) throw new Error("Crystal connector is not registered");
  const aktg = aktgConfigured();
  const missing = aktg ? [] : missingSecrets(cfg);
  let health: { ok: boolean; message: string } | null = null;
  if (includeHealth && aktg) {
    health = await aktgHealth();
    log({ at: new Date().toISOString(), action: "health", ok: health.ok, detail: health.message });
  } else if (includeHealth && missing.length === 0) {
    const h = await checkHealth(cfg);
    health = { ok: h.reachable === true, message: h.message };
    log({ at: new Date().toISOString(), action: "health", ok: health.ok, detail: health.message });
  }
  return {
    partnerId: cfg.id,
    partnerName: cfg.name,
    mode: aktg ? "live" : resolveMode(cfg),
    contractStatus: cfg.contractStatus,
    authKind: aktg ? "api-key-header (AKTG ApiKey)" : cfg.auth.kind,
    credentialsRequired: aktg ? ["CRYSTAL_AKTG_API_KEY"] : cfg.auth.secrets,
    credentialsMissing: missing,
    capabilities: cfg.capabilities,
    endpoints: cfg.endpoints as Record<string, string | undefined>,
    feed: cfg.feed
      ? {
          format: cfg.feed.format,
          recordPath: cfg.feed.recordPath,
          mappedFields: Object.keys(cfg.feed.fieldMap).length,
          pushEnabled: Boolean(cfg.feed.webhookSecret),
          pushPath: `/api/public/partner-feed/${cfg.id}`,
          refreshCron: cfg.feed.refreshCron,
        }
      : null,
    syncEnabled: aktg || missing.length === 0,
    inventoryCount: aktg
      ? (await fetchAktgVoyages("USD")).voyages.length
      : licensedVoyages().length,
    lastSyncAt,
    health,
    audit: crystalAudit(),
  };
}

export interface CrystalSyncOutcome {
  ran: boolean;
  reason?: string;
  received: number;
  accepted: number;
  durationMs: number;
  warnings: string[];
}

/** Pull licensed voyages. No credentials → no sync, no synthetic inventory. */
export async function crystalSync(force = false): Promise<CrystalSyncOutcome> {
  const started = Date.now();
  const { getConnector } = await import("@/lib/partners/registry");
  const { missingSecrets, syncCatalogue, invalidatePartnerCache } =
    await import("@/lib/partners/runtime.server");
  const { setLicensedVoyages } = await import("./inventory");
  const { aktgConfigured, fetchAktgVoyages, invalidateAktgCache } = await import("./aktg.server");
  if (aktgConfigured()) {
    if (force) invalidateAktgCache();
    const feed = await fetchAktgVoyages("USD", { force });
    const accepted = setLicensedVoyages(feed.voyages);
    lastSyncAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    log({
      at: lastSyncAt,
      action: feed.error ? "error" : "sync",
      ok: !feed.error,
      detail: feed.error
        ? `AKTG Shopping API sync failed: ${feed.error}`
        : `${accepted} live voyages ingested from the AKTG Shopping API`,
      durationMs,
    });
    return {
      ran: !feed.error,
      reason: feed.error,
      received: feed.received,
      accepted,
      durationMs,
      warnings: feed.error ? [feed.error] : [],
    };
  }
  const cfg = getConnector(CRYSTAL_SUPPLIER_ID)!;
  const missing = missingSecrets(cfg);
  if (missing.length > 0) {
    const reason = `Live synchronisation is disabled until an authorised integration is configured (missing: ${missing.join(", ")}).`;
    log({ at: new Date().toISOString(), action: "sync", ok: false, detail: reason });
    return { ran: false, reason, received: 0, accepted: 0, durationMs: 0, warnings: [] };
  }
  if (force) invalidatePartnerCache(cfg.id);
  const result = await syncCatalogue(cfg.id, { force });
  // Only supplier-sourced records are admitted; demonstration fallbacks are dropped.
  const licensed = result.journeys.filter((j) => j.dataSource === "partner-api");
  const voyages = licensed
    .map((j) =>
      normaliseVoyage({
        code: j.code,
        title: j.title,
        subtitle: j.subtitle,
        shipName: j.ships[0] ?? j.vessel?.name ?? "",
        shipSlug: j.ships[0] ?? j.vessel?.name ?? "",
        destination: j.region,
        destinationName: j.region,
        region: j.region,
        countries: [j.country],
        embarkPort: j.cities[0] ?? "",
        disembarkPort: j.cities[j.cities.length - 1] ?? "",
        nights: j.durationNights,
        departureDate: j.departures[0]?.date ?? j.availableDates?.[0] ?? "",
        currency: j.currency,
        fares: [{ suiteCategory: "ocean-view", price: j.priceFrom, currency: j.currency }],
        itinerary: j.itinerary.map((d) => ({
          day: d.day,
          port: d.location,
          summary: d.description,
        })),
        inclusions: j.inclusions,
        heroImage: j.media.hero,
        gallery: j.media.gallery,
        availability:
          j.departures[0]?.availability === "sold-out"
            ? "closed"
            : j.departures[0]?.availability === "waitlist"
              ? "waitlist"
              : "open",
        updatedAt: j.updatedAt,
      }),
    )
    .filter((v): v is CrystalVoyage => Boolean(v));
  const accepted = setLicensedVoyages(voyages);
  lastSyncAt = new Date().toISOString();
  const durationMs = Date.now() - started;
  log({
    at: lastSyncAt,
    action: "sync",
    ok: true,
    detail: `${accepted} licensed voyages ingested from ${result.partnerName}`,
    durationMs,
  });
  return {
    ran: true,
    received: result.received ?? licensed.length,
    accepted,
    durationMs,
    warnings: result.warnings ?? [],
  };
}

/** Booking / amendment / cancellation hand-off. Requires live credentials. */
export async function crystalReservationAction(
  action: "booking-request" | "amendment" | "cancellation",
  payload: Record<string, unknown>,
): Promise<{ accepted: boolean; message: string }> {
  const { getConnector } = await import("@/lib/partners/registry");
  const { missingSecrets, partnerRequest } = await import("@/lib/partners/runtime.server");
  const cfg = getConnector(CRYSTAL_SUPPLIER_ID)!;
  if (missingSecrets(cfg).length > 0) {
    const message =
      "Reservation routed to a Worldway cruise specialist — direct supplier messaging activates with the authorised integration.";
    log({ at: new Date().toISOString(), action, ok: true, detail: message });
    return { accepted: false, message };
  }
  const path =
    action === "booking-request"
      ? cfg.endpoints.booking
      : action === "cancellation"
        ? cfg.endpoints.cancellation
        : cfg.endpoints.amendment;
  if (!path) return { accepted: false, message: `${action} is not supported by this connector.` };
  const res = await partnerRequest(cfg, path, { method: "POST", body: payload });
  log({
    at: new Date().toISOString(),
    action,
    ok: res.ok,
    detail: res.ok ? "accepted by supplier" : (res.error ?? "supplier rejected the request"),
  });
  return { accepted: res.ok, message: res.ok ? "Accepted by supplier" : (res.error ?? "Failed") };
}
