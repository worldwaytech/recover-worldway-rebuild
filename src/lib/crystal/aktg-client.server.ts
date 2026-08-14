// Raw AKTG (A&K Travel Group) Shopping API client — server only.
//
// One function per documented Production operation in the AKTG Shopping API
// OpenAPI 3 specification (https://api.aktravelgroup.com/shopping). The
// subscription key is read from the runtime environment inside each request and
// never crosses the server boundary. Every call is retried on 429/5xx, timed
// out, cached per (operation, query) and audit-logged.
//
// Documented operations (all GET, ApiKey header auth):
//   GET /v1/flatfiles/cruiseprices        price-feed-flat-file            (CSV)
//   GET /v1/cruiseprices                  get-cruise-suite-category-prices-json
//   GET /d/v1/products/cruises            get-voyages
//   GET /d/v1/products/destinations       get-available-destinations
//   GET /d/v1/cruises/availability        get-price-suite-availability
//   GET /d/v1/cruises/ports               get-ports
//   GET /d/v1/cruises/suitecategories     get-ship-suite-categories
//   GET /d/v1/cruises/voyagepricetypes    voyage price types
//   GET /d/v1/cruises/pricespromotions    prices and promotions
//   GET /d/v1/general/pricetypes          get-price-types
//   GET /d/v1/wsPromo/promoCrystalNew     promotions catalogue
//   GET /d/v1/wsPackage/experienceTEST    package experience (supplier TEST op)
//
// No booking, hold, reservation, cancellation or payment operation exists in
// the specification — this API is shopping-only.

const BASE_URL = "https://api.aktravelgroup.com/shopping";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

/* --------------------------------- envelope -------------------------------- */

export interface AktgEnvelope<T> {
  body?: T;
  statusMessage?: string;
  statusCod?: number;
  apiVersion?: number;
  pageNumber?: number;
  recordsCount?: number;
  pageTotal?: number;
  errors?: unknown[];
}

/* ------------------------------- audit trail ------------------------------- */

export interface AktgAuditEntry {
  at: string;
  operation: string;
  path: string;
  ok: boolean;
  status?: number;
  attempts: number;
  durationMs: number;
  bytes?: number;
  cached?: boolean;
  detail?: string;
}

const AUDIT: AktgAuditEntry[] = [];

function audit(entry: AktgAuditEntry) {
  AUDIT.push(entry);
  if (AUDIT.length > 400) AUDIT.splice(0, AUDIT.length - 400);
}

/** Supplier call audit trail (no credentials are ever recorded). */
export function aktgAudit(limit = 50): AktgAuditEntry[] {
  return AUDIT.slice(-limit).reverse();
}

/* ---------------------------------- cache ---------------------------------- */

interface CacheEntry {
  at: number;
  value: unknown;
}

const CACHE = new Map<string, CacheEntry>();

export function invalidateAktgClientCache(): void {
  CACHE.clear();
}

export function aktgApiKey(): string | undefined {
  return process.env["CRYSTAL_AKTG_API_KEY"] || undefined;
}

export function aktgConfigured(): boolean {
  return Boolean(aktgApiKey());
}

export class AktgError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AktgError";
    this.status = status;
  }
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOptions {
  operation: string;
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  /** Cache lifetime in ms; 0 disables caching. */
  ttlMs?: number;
  force?: boolean;
  text?: boolean;
}

async function request<T>(opts: RequestOptions): Promise<T> {
  const key = aktgApiKey();
  if (!key) throw new AktgError("CRYSTAL_AKTG_API_KEY is not configured.");
  const url = `${BASE_URL}${opts.path}${query(opts.params ?? {})}`;
  const ttl = opts.ttlMs ?? 0;
  const cacheKey = `${opts.operation}:${url}`;
  const now = Date.now();
  if (!opts.force && ttl > 0) {
    const hit = CACHE.get(cacheKey);
    if (hit && now - hit.at < ttl) {
      audit({
        at: new Date().toISOString(),
        operation: opts.operation,
        path: opts.path,
        ok: true,
        attempts: 0,
        durationMs: 0,
        cached: true,
      });
      return hit.value as T;
    }
  }

  const started = Date.now();
  let lastError = "";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { ApiKey: key, Accept: opts.text ? "text/plain" : "application/json" },
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        lastError = `supplier responded ${res.status}`;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(700 * attempt);
          continue;
        }
        throw new AktgError(lastError, res.status);
      }
      if (!res.ok) throw new AktgError(`supplier responded ${res.status}`, res.status);
      const value = (opts.text ? await res.text() : await res.json()) as T;
      if (ttl > 0) CACHE.set(cacheKey, { at: Date.now(), value });
      audit({
        at: new Date().toISOString(),
        operation: opts.operation,
        path: opts.path,
        ok: true,
        status: res.status,
        attempts: attempt,
        durationMs: Date.now() - started,
        bytes: typeof value === "string" ? value.length : undefined,
      });
      return value;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt >= MAX_ATTEMPTS) break;
      await sleep(700 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  audit({
    at: new Date().toISOString(),
    operation: opts.operation,
    path: opts.path,
    ok: false,
    status: lastStatus,
    attempts: MAX_ATTEMPTS,
    durationMs: Date.now() - started,
    detail: lastError,
  });
  throw new AktgError(lastError || "supplier request failed", lastStatus);
}

/* ------------------------------ response shapes ---------------------------- */

export interface AktgItineraryRow {
  voyageID?: number;
  cityCod?: string | null;
  portCod?: string | null;
  cityName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  countryCodISO2?: string | null;
  countryCodISO3?: string | null;
  country?: string | null;
  pos?: number | null;
  day?: number | null;
  itineraryDate?: string | null;
  arrivalTime?: string | null;
  embarkFrom?: string | null;
  embarkTo?: string | null;
  debarkFrom?: string | null;
  debarkTo?: string | null;
  departTime?: string | null;
  isRealCity?: boolean | null;
  isOvernight?: boolean | null;
  dockAnchor?: string | null;
  dressCode?: string | null;
}

export interface AktgVoyageProduct {
  voyageID?: number;
  ship?: string | null;
  shipCod?: string | null;
  cruiseLine?: string | null;
  cruiseLineCod?: string | null;
  voyageNumber?: string | null;
  voyageName?: string | null;
  description?: string | null;
  duration?: number | null;
  embarkDate?: string | null;
  embarkPortCod?: string | null;
  embarkPort?: string | null;
  debarkDate?: string | null;
  debarkPortCod?: string | null;
  debarkPort?: string | null;
  destinationID?: number | null;
  subDestinationID?: number | null;
  isAvailable?: boolean | null;
  price?: number | null;
  currency?: string | null;
  priceTypeName?: string | null;
  priceTypeCod?: string | null;
  voyageType?: string | null;
  voyageClass?: string | null;
  map?: string | null;
  title?: string | null;
  voyageDescription?: string | null;
  image1?: string | null;
  image2?: string | null;
  mapSVG?: string | null;
  mapPNG?: string | null;
  mapPNG2?: string | null;
  mapPNG3?: string | null;
  itineraryPdf?: string | null;
  previousVoyageID?: number | null;
  nextVoyageID?: number | null;
  packageID?: number | null;
  isWaitListed?: string | null;
  itineraries?: AktgItineraryRow[] | null;
}

export interface AktgAvailabilityRow {
  voyageNumber?: string | null;
  sailDate?: string | null;
  shipCod?: string | null;
  ship?: string | null;
  categoryCod?: string | null;
  category?: string | null;
  isSellableFromWeb?: string | null;
  isConnectedCategory?: boolean | null;
  totAV?: number | null;
  totGTY?: number | null;
  sgl?: number | null;
  dbl?: number | null;
  trip?: number | null;
  quad?: number | null;
  quin?: number | null;
  six?: number | null;
  totADA?: number | null;
  priceTypeName?: string | null;
  priceTypeCod?: string | null;
  priceSingle?: number | null;
  priceDouble?: number | null;
  priceExtraGuest?: number | null;
  priceChild?: number | null;
  pastCCPriceSingle?: number | null;
  pastCCPriceDouble?: number | null;
  pastGuestDiscount?: number | null;
  currency?: string | null;
  tax?: number | null;
  portCharge?: number | null;
  ncf?: number | null;
  displayPrice?: number | null;
  isStartingPrice?: boolean | null;
  maxCapacity?: number | null;
}

export interface AktgPortRow {
  city?: string | null;
  cityCod?: string | null;
  portCod?: string | null;
  country?: string | null;
  countryCodISO3?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isRealCity?: boolean | null;
  name?: string | null;
  description?: string | null;
  image1?: string | null;
  image2?: string | null;
  image3?: string | null;
}

export interface AktgSuiteCategoryRow {
  shipCod?: string | null;
  suiteCategoryCod?: string | null;
  suiteCategory?: string | null;
  suiteCategoryGroupCod?: string | null;
}

export interface AktgShipSuiteCategories {
  shipCod?: string | null;
  ship?: string | null;
  suiteCategories?: AktgSuiteCategoryRow[] | null;
}

export interface AktgPriceTypeRow {
  priceTypeID?: number | null;
  priceTypeName?: string | null;
  priceTypeCod?: string | null;
}

export interface AktgDestinationRow {
  destinationID?: number | null;
  destinationName?: string | null;
  destinationDescription?: string | null;
  destinationImage1?: string | null;
  destinationImage2?: string | null;
  destinationImage3?: string | null;
}

export interface AktgVoyagePriceTypeRow {
  voyageNumber?: string | null;
  priceTypeCod?: string | null;
  priceTypeName?: string | null;
  currency?: string | null;
}

export interface AktgPromoItem {
  promoID?: number | null;
  promoCode?: string | null;
  promoDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AktgPromoRow {
  promoID?: number | null;
  promoName?: string | null;
  shortDescription?: string | null;
  termAndCondition?: string | null;
  promoTypeID?: number | null;
  promoType?: string | null;
  companyID?: number | null;
  tradePortalVisibility?: string | null;
  item?: AktgPromoItem[] | null;
}

/** `/d/v1/cruises/pricespromotions` price row (table dT0). */
export interface AktgPricePromotionRow {
  voyageNumber?: string | null;
  sailDate?: string | null;
  shipCod?: string | null;
  ship?: string | null;
  embarkPortCod?: string | null;
  embarkPort?: string | null;
  debarkPortCod?: string | null;
  debarkPort?: string | null;
  duration?: number | null;
  categoryCod?: string | null;
  category?: string | null;
  maxCapacity?: number | null;
  priceTypeName?: string | null;
  priceTypeCod?: string | null;
  currency?: string | null;
  priceSingle?: number | null;
  priceDouble?: number | null;
  priceExtraGuest?: number | null;
  priceChild?: number | null;
  portCharge?: number | null;
  tax?: number | null;
  promoID?: number | null;
  promoDescription?: string | null;
  discountPriceSingle?: number | null;
  discountPriceDouble?: number | null;
  discountPriceExtraGuest?: number | null;
  discountPriceChild?: number | null;
  pastGuestDiscount?: number | null;
  pastCCPriceSingle?: number | null;
  pastCCPriceDouble?: number | null;
  pastCCDiscPriceSingle?: number | null;
  pastCCDiscPriceDouble?: number | null;
  availability?: string | null;
}

export interface AktgPaymentScheduleRow {
  voyageNumber?: string | null;
  categoryType?: string | null;
  optionDueDate?: string | null;
  optionPerc?: number | null;
  finalPaymentDate?: string | null;
}

export interface AktgPenaltyRow {
  voyageNumber?: string | null;
  suiteCategoryCod?: string | null;
  daysFrom?: number | null;
  daysTo?: number | null;
  amountPerc?: number | null;
  fixedAmount?: number | null;
}

export interface AktgPromoDefinitionRow {
  promoID?: number | null;
  promoName?: string | null;
  promoDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AktgPromoVoyageRow {
  promoID?: number | null;
  promoName?: string | null;
  voyageNumber?: string | null;
  sailingDate?: string | null;
  sailingEndDate?: string | null;
}

export interface AktgPricesPromotions {
  prices: AktgPricePromotionRow[];
  paymentSchedules: AktgPaymentScheduleRow[];
  penalties: AktgPenaltyRow[];
  promotions: AktgPromoDefinitionRow[];
  promotionVoyages: AktgPromoVoyageRow[];
}

/* -------------------------- suite category prices -------------------------- */

export interface AktgSuitePriceRow {
  priceTypeCod?: string | null;
  priceTypeName?: string | null;
  categoryCod?: string | null;
  category?: string | null;
  priceSingle?: number | null;
  priceDouble?: number | null;
  priceExtraGuest?: number | null;
  priceChild?: number | null;
  pastGuestPriceSingle?: number | null;
  pastGuestPriceDouble?: number | null;
  portCharge?: number | null;
  pastGuestDiscount?: number | null;
  availability?: string | null;
  comboSavPriceDouble?: number | null;
  comboSaving?: number | null;
  airCredit?: number | null;
}

export interface AktgVoyagePriceRow {
  voyageNumber?: string | null;
  shipCod?: string | null;
  ship?: string | null;
  sailDate?: string | null;
  duration?: number | null;
  embarkPortCod?: string | null;
  embarkPort?: string | null;
  debarkPortCod?: string | null;
  debarkPort?: string | null;
  prices?: AktgSuitePriceRow[] | null;
  paymentsSchedule?: AktgPaymentScheduleRow[] | null;
  penalties?: AktgPenaltyRow[] | null;
}

/* ------------------------------- operations -------------------------------- */

const TTL_CATALOGUE = 30 * 60 * 1000;
const TTL_REFERENCE = 12 * 60 * 60 * 1000;
const TTL_LIVE = 60 * 1000;

/** get-voyages: full voyage catalogue with itineraries, media and maps. */
export async function getVoyages(
  params: {
    currency?: string;
    pageNum?: number;
    pageSize?: number;
    priceTypeCod?: string;
    voyageNumber?: string;
  } = {},
  opts: { force?: boolean } = {},
): Promise<AktgEnvelope<{ voyages?: AktgVoyageProduct[] }>> {
  return request({
    operation: "get-voyages",
    path: "/d/v1/products/cruises",
    params: {
      currency: params.currency ?? "USD",
      pageNum: params.pageNum ?? 1,
      pageSize: params.pageSize ?? 500,
      priceTypeCod: params.priceTypeCod,
      voyageNumber: params.voyageNumber,
    },
    ttlMs: TTL_CATALOGUE,
    force: opts.force,
  });
}

/** get-cruise-suite-category-prices-json: all suite prices and availability. */
export async function getCruiseSuiteCategoryPrices(
  params: { currency?: string; priceTypeCod?: string } = {},
  opts: { force?: boolean } = {},
): Promise<AktgEnvelope<{ voyagePrices?: AktgVoyagePriceRow[] }>> {
  return request({
    operation: "get-cruise-suite-category-prices-json",
    path: "/v1/cruiseprices",
    params: { currency: params.currency ?? "USD", priceTypeCod: params.priceTypeCod },
    ttlMs: TTL_CATALOGUE,
    force: opts.force,
  });
}

/**
 * price-feed-flat-file: CSV price feed. Implemented for operational
 * reconciliation only — per AKTG guidance the structured endpoints
 * (voyages + prices/promotions + availability) are the source of truth for
 * catalogue synchronisation, so this is never used by customer-facing code.
 */
export async function getPriceFeedFlatFile(
  params: { currency?: string; priceTypeCod?: string } = {},
): Promise<string> {
  return request<string>({
    operation: "price-feed-flat-file",
    path: "/v1/flatfiles/cruiseprices",
    params: { currency: params.currency ?? "USD", priceTypeCod: params.priceTypeCod ?? "FIT" },
    ttlMs: TTL_CATALOGUE,
    text: true,
  });
}

/** get-price-suite-availability: live per-category price and availability. */
export async function getPriceAndAvailability(
  params: { currency?: string; voyageNumber?: string; priceTypeCod?: string },
  opts: { force?: boolean } = {},
): Promise<AktgEnvelope<{ availability?: AktgAvailabilityRow[] }>> {
  return request({
    operation: "get-price-suite-availability",
    path: "/d/v1/cruises/availability",
    params: {
      currency: params.currency ?? "USD",
      voyageNumber: params.voyageNumber,
      priceTypeCod: params.priceTypeCod,
    },
    ttlMs: TTL_LIVE,
    force: opts.force,
  });
}

/** get-ports */
export async function getPorts(
  params: { realCity?: boolean; cityCod?: string; pageNum?: number; pageSize?: number } = {},
): Promise<AktgEnvelope<{ ports?: AktgPortRow[] }>> {
  return request({
    operation: "get-ports",
    path: "/d/v1/cruises/ports",
    params: {
      realCity: params.realCity,
      cityCod: params.cityCod,
      pageNum: params.pageNum ?? 1,
      pageSize: params.pageSize ?? 1000,
    },
    ttlMs: TTL_REFERENCE,
  });
}

/** get-ship-suite-categories */
export async function getShipSuiteCategories(
  params: { shipCod?: string } = {},
): Promise<AktgEnvelope<{ ships?: AktgShipSuiteCategories[] }>> {
  return request({
    operation: "get-ship-suite-categories",
    path: "/d/v1/cruises/suitecategories",
    params: { shipCod: params.shipCod },
    ttlMs: TTL_REFERENCE,
  });
}

/** get-price-types */
export async function getPriceTypes(): Promise<AktgEnvelope<{ priceTypes?: AktgPriceTypeRow[] }>> {
  return request({
    operation: "get-price-types",
    path: "/d/v1/general/pricetypes",
    ttlMs: TTL_REFERENCE,
  });
}

/** get-available-destinations */
export async function getDestinations(
  params: { currency?: string } = {},
): Promise<AktgEnvelope<{ destinations?: AktgDestinationRow[] }>> {
  return request({
    operation: "get-available-destinations",
    path: "/d/v1/products/destinations",
    params: { currency: params.currency ?? "USD" },
    ttlMs: TTL_REFERENCE,
  });
}

/** voyage price types */
export async function getVoyagePriceTypes(
  params: { currency?: string; voyageNumber?: string } = {},
): Promise<AktgEnvelope<{ voyagePriceTypes?: AktgVoyagePriceTypeRow[] }>> {
  return request({
    operation: "get-voyage-price-types",
    path: "/d/v1/cruises/voyagepricetypes",
    params: { currency: params.currency ?? "USD", voyageNumber: params.voyageNumber },
    ttlMs: TTL_REFERENCE,
  });
}

/** promoCrystalNew: promotions catalogue. */
export async function getPromotions(
  params: { priceTypeCod?: string } = {},
): Promise<AktgEnvelope<{ promo?: AktgPromoRow[] }>> {
  return request({
    operation: "get-promotions",
    path: "/d/v1/wsPromo/promoCrystalNew",
    params: { priceTypeCod: params.priceTypeCod },
    ttlMs: TTL_REFERENCE,
  });
}

/** prices and promotions: per-voyage discounted fares, deposits, penalties. */
export async function getPricesAndPromotions(
  params: { currency?: string; voyageNumber?: string; priceTypeCod?: string } = {},
  opts: { force?: boolean } = {},
): Promise<AktgPricesPromotions> {
  const res = await request<
    AktgEnvelope<{
      dT0?: AktgPricePromotionRow[];
      dT1?: AktgPaymentScheduleRow[];
      dT2?: AktgPenaltyRow[];
      dT3?: AktgPromoDefinitionRow[];
      dT4?: unknown[];
      dT5?: AktgPromoVoyageRow[];
    }>
  >({
    operation: "get-prices-promotions",
    path: "/d/v1/cruises/pricespromotions",
    params: {
      currency: params.currency ?? "USD",
      voyageNumber: params.voyageNumber,
      priceTypeCod: params.priceTypeCod,
    },
    ttlMs: params.voyageNumber ? TTL_LIVE : TTL_CATALOGUE,
    force: opts.force,
  });
  const b = res.body ?? {};
  return {
    prices: b.dT0 ?? [],
    paymentSchedules: b.dT1 ?? [],
    penalties: b.dT2 ?? [],
    promotions: b.dT3 ?? [],
    promotionVoyages: b.dT5 ?? [],
  };
}

/**
 * Package Experience — supplier-labelled TEST operation. Not production
 * approved by AKTG, so it is intentionally not wired into any customer or
 * admin surface; kept only so the client mirrors the specification.
 */
export async function getPackageExperience(
  params: { priceTypeCod?: string } = {},
): Promise<AktgEnvelope<Record<string, unknown>>> {
  return request({
    operation: "get-package-experience",
    path: "/d/v1/wsPackage/experienceTEST",
    params: { priceTypeCod: params.priceTypeCod },
    ttlMs: TTL_REFERENCE,
  });
}
