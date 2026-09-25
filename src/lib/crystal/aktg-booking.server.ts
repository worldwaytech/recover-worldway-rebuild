// AKTG (A&K Travel Group) Booking API adapter — server only.
//
// The Shopping API (see aktg-client.server.ts) is production live. The Booking
// API is driven by the supplied AKTG Booking API (PROD) specification: the
// exact PROD paths, HTTP methods and required path parameters in that spec are
// the single source of truth (see CRYSTAL_BOOKING_SPEC in booking-contract.ts).
// The rail is FAIL-CLOSED: no endpoint is ever guessed, no booking is placed
// while the rail is disabled, and every state-changing call is gated on the
// rail being armed with a valid channel context and API key.
//
// Runtime configuration (all server-side secrets/env, never in the bundle):
//   CRYSTAL_BOOKING_ENABLED         "true" to arm the rail
//   CRYSTAL_BOOKING_BASE_URL        optional override; defaults to the PROD base
//   CRYSTAL_BOOKING_SALES_CHANNEL   X-SalesChannel value (from AKTG contract)
//   CRYSTAL_BOOKING_OFFICE_ID       X-OfficeID value (from AKTG contract)
//   CRYSTAL_BOOKING_PATH_<OP>       optional per-operation path override
//   CRYSTAL_BOOKING_METHOD_<OP>     optional per-operation method override
// Authentication reuses the authorised CRYSTAL_AKTG_API_KEY ApiKey header.
import type {
  CrystalAvailableSuite,
  CrystalAvailableSuitesInput,
  CrystalBookingBlockReason,
  CrystalBookingCapability,
  CrystalBookingOperation,
  CrystalChannelContextState,
  CrystalOperationStatus,
} from "./booking-contract";
import {
  CRYSTAL_BOOKING_SPEC,
  CRYSTAL_ALL_OPERATIONS,
  CRYSTAL_CRITERIA_REQUIRED_OPERATIONS,
  CRYSTAL_READ_ONLY_OPERATIONS,
  CRYSTAL_REQUIRED_OPERATIONS,
  availableSuitesInputSchema,
  normaliseAvailableSuites,
} from "./booking-contract";
import { crystalBookingApiStatus, CRYSTAL_SHOPPING_API_STATUS } from "./connector.server";

/** Documented PROD base URL for the AKTG Booking API (from the supplied spec). */
const DEFAULT_BASE_URL = "https://api.aktravelgroup.com/bookingapi";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** Env var that may override a documented operation's PROD path ("" = none). */
export function operationEnvVar(op: CrystalBookingOperation): string {
  return specFor(op)?.envVar ?? "";
}

function specFor(op: CrystalBookingOperation) {
  return CRYSTAL_BOOKING_SPEC.find((s) => s.operation === op);
}

/** The exact documented PROD path, unless a server-side override is supplied. */
function operationPath(op: CrystalBookingOperation): string | undefined {
  const spec = specFor(op);
  if (!spec) return undefined;
  const override = env(spec.envVar);
  return override || spec.path;
}

/**
 * Presence-only view of the server-side supplier channel context
 * (X-SalesChannel / X-OfficeID). The actual values are read from env inside
 * request construction and never cross the client boundary.
 */
export function channelContextState(): CrystalChannelContextState {
  return {
    salesChannelConfigured: Boolean(env("CRYSTAL_BOOKING_SALES_CHANNEL")),
    officeIdConfigured: Boolean(env("CRYSTAL_BOOKING_OFFICE_ID")),
  };
}

/** Header values supplied by the AKTG contract; empty strings are omitted. */
function channelHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const salesChannel = env("CRYSTAL_BOOKING_SALES_CHANNEL");
  const officeId = env("CRYSTAL_BOOKING_OFFICE_ID");
  if (salesChannel) headers["X-SalesChannel"] = salesChannel;
  if (officeId) headers["X-OfficeID"] = officeId;
  return headers;
}

export interface CrystalBookingAuditEntry {
  at: string;
  operation: CrystalBookingOperation | "capability";
  ok: boolean;
  status?: number;
  attempts: number;
  durationMs: number;
  /** Credential-free correlation reference only. */
  reference?: string;
  detail?: string;
}

const AUDIT: CrystalBookingAuditEntry[] = [];

export function crystalBookingAudit(limit = 40): CrystalBookingAuditEntry[] {
  return AUDIT.slice(-limit).reverse();
}

function audit(entry: CrystalBookingAuditEntry) {
  AUDIT.push(entry);
  if (AUDIT.length > 300) AUDIT.splice(0, AUDIT.length - 300);
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function apiKey(): string {
  return env("CRYSTAL_AKTG_API_KEY");
}

export class CrystalBookingUnavailableError extends Error {
  readonly reason: CrystalBookingBlockReason;
  constructor(reason: CrystalBookingBlockReason, message: string) {
    super(message);
    this.name = "CrystalBookingUnavailableError";
    this.reason = reason;
  }
}

/** Documented operations are always "reachable" once a base URL is set. */
export function configuredOperations(): CrystalBookingOperation[] {
  if (!env("CRYSTAL_BOOKING_BASE_URL") && DEFAULT_BASE_URL.length === 0) return [];
  return [...CRYSTAL_ALL_OPERATIONS];
}

export function bookingCapability(): CrystalBookingCapability {
  const base: Pick<CrystalBookingCapability, "shoppingApiStatus" | "bookingApiStatus"> = {
    shoppingApiStatus: CRYSTAL_SHOPPING_API_STATUS,
    bookingApiStatus: crystalBookingApiStatus(),
  };
  const channel = channelContextState();
  const ops = configuredOperations();
  if (!apiKey()) {
    return {
      ...base,
      channel,
      live: false,
      operations: [],
      reason: "credentials_missing",
      detail: "The authorised AKTG subscription key is not present in this environment.",
    };
  }
  if (env("CRYSTAL_BOOKING_ENABLED").toLowerCase() !== "true") {
    return {
      ...base,
      channel,
      live: false,
      operations: ops,
      reason: "booking_api_disabled",
      detail:
        "Crystal supplier booking is intentionally disabled until AKTG certifies the Booking API for this account.",
    };
  }
  if (ops.length === 0) {
    return {
      ...base,
      channel,
      live: false,
      operations: [],
      reason: "booking_api_not_configured",
      detail:
        "No AKTG Booking API base URL has been supplied, so no booking endpoint can be called.",
    };
  }
  if (!channel.salesChannelConfigured || !channel.officeIdConfigured) {
    return {
      ...base,
      channel,
      live: false,
      operations: ops,
      reason: "channel_context_missing",
      detail: !channel.salesChannelConfigured
        ? "X-SalesChannel is not configured for the Crystal booking rail."
        : "X-OfficeID is not configured for the Crystal booking rail.",
    };
  }
  const missing = CRYSTAL_REQUIRED_OPERATIONS.filter((op) => !ops.includes(op));
  if (missing.length) {
    return {
      ...base,
      channel,
      live: false,
      operations: ops,
      reason: "booking_api_not_authorised",
      detail: `AKTG Booking API operations still missing: ${missing.join(", ")}.`,
    };
  }
  // Activation gates: our server egress must be confirmed on AKTG's allowlist,
  // and AKTG must have certified this account, before the rail may arm.
  if (!egressConfirmed()) {
    return {
      ...base,
      channel,
      live: false,
      operations: ops,
      reason: "egress_not_confirmed",
      detail:
        "AKTG has not confirmed that our server egress IP is allowlisted on the Booking API host.",
    };
  }
  if (!certified()) {
    return {
      ...base,
      channel,
      live: false,
      operations: ops,
      reason: "not_certified",
      detail: "AKTG Booking API certification sign-off has not been recorded for this account.",
    };
  }
  // Production booking test passed on 2026-09-25 (Crystal booking 475465,
  // created and cancelled at zero cost; recorded in admin_audit_log), so the
  // temporary Worldway authorisation gate has been removed.
  return { ...base, channel, live: true, operations: ops, detail: "AKTG Booking API armed." };
}

/** Production booking test authorised and passed (booking 475465, 2026-09-25). */
export function prodBookingTestAuthorized(): boolean {
  return true;
}

/** Set to "true" only after AKTG confirms our outbound IP is allowlisted. */
export function egressConfirmed(): boolean {
  return env("CRYSTAL_BOOKING_EGRESS_CONFIRMED").toLowerCase() === "true";
}

/** Set to "true" only after AKTG signs off Booking API certification. */
export function certified(): boolean {
  return env("CRYSTAL_BOOKING_CERTIFIED").toLowerCase() === "true";
}

/** Whether the operator has flipped the LIVE switch (gates still apply). */
export function bookingEnabledFlag(): boolean {
  return env("CRYSTAL_BOOKING_ENABLED").toLowerCase() === "true";
}

/** Presence-only credential state for the readiness report. */
export function bookingCredentialConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Full documented-operation catalogue with per-operation configuration state.
 * Used by the admin rail to report configured vs unconfigured operations without
 * ever revealing a URL, path or credential.
 */
export function bookingOperationCatalog(): CrystalOperationStatus[] {
  const configured = new Set(configuredOperations());
  return CRYSTAL_ALL_OPERATIONS.map((operation) => {
    const spec = specFor(operation);
    return {
      operation,
      configured: configured.has(operation),
      required: CRYSTAL_REQUIRED_OPERATIONS.includes(operation),
      readOnly: CRYSTAL_READ_ONLY_OPERATIONS.includes(operation),
      method: spec?.method ?? "GET",
      envVar: spec?.envVar ?? "",
    };
  });
}

/** True when an operation is safe to call without mutating supplier state. */
export function isReadOnlyOperation(op: CrystalBookingOperation): boolean {
  return CRYSTAL_READ_ONLY_OPERATIONS.includes(op);
}

/**
 * HTTP method for an operation. Uses the exact method documented in the spec;
 * a server-side override can pin a different method when AKTG updates a
 * contract before the code is redeployed. Never guessed.
 */
export function operationMethod(op: CrystalBookingOperation): "GET" | "POST" | "PUT" | "DELETE" {
  const configured = env(`CRYSTAL_BOOKING_METHOD_${op.toUpperCase()}`).toUpperCase();
  if (
    configured === "GET" ||
    configured === "POST" ||
    configured === "PUT" ||
    configured === "DELETE"
  ) {
    return configured;
  }
  return specFor(op)?.method ?? "GET";
}

export function assertBookingLive(op: CrystalBookingOperation) {
  const cap = bookingCapability();
  if (!cap.live || !cap.operations.includes(op)) {
    throw new CrystalBookingUnavailableError(
      cap.reason ?? "booking_api_not_authorised",
      cap.detail,
    );
  }
}

interface CallOptions {
  operation: CrystalBookingOperation;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Path parameters named in the spec (e.g. bookingId), substituted into the path. */
  pathParams?: Record<string, string | number>;
  /** Supplier-side idempotency key; also used for our own audit correlation. */
  idempotencyKey?: string;
  reference?: string;
}

/** Perform one documented booking operation with retries, timeout and audit. */
export async function bookingCall<T>(opts: CallOptions): Promise<T> {
  assertBookingLive(opts.operation);
  const started = Date.now();
  const key = apiKey();
  const spec = specFor(opts.operation);
  if (!spec) throw new Error(`Unknown Crystal booking operation: ${opts.operation}`);

  const base = (env("CRYSTAL_BOOKING_BASE_URL") || DEFAULT_BASE_URL).replace(/\/?$/, "/");
  // Substitute documented path parameters; refuse to call when one is missing.
  let path = operationPath(opts.operation) ?? spec.path;
  for (const token of spec.requiredPathParams) {
    const value = opts.pathParams?.[token];
    if (value === undefined) {
      throw new Error(
        `Crystal booking ${opts.operation} requires path parameter '${token}' and none was supplied.`,
      );
    }
    path = path.replace(`{${token}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(path.replace(/^\//, ""), base);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const method = operationMethod(opts.operation);
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastDetail = "";

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        ApiKey: key,
        Accept: "application/json",
        ...channelHeaders(),
      };
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

      const res = await fetch(url.toString(), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      lastStatus = res.status;
      const text = await res.text();
      if (res.ok) {
        audit({
          at: new Date().toISOString(),
          operation: opts.operation,
          ok: true,
          status: res.status,
          attempts,
          durationMs: Date.now() - started,
          reference: opts.reference,
        });
        return (text ? JSON.parse(text) : {}) as T;
      }
      lastDetail = `supplier responded ${res.status}`;
      // Retry only transient conditions; never retry a rejected booking.
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : "request failed";
    } finally {
      clearTimeout(timer);
    }
    if (attempts < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempts));
  }

  audit({
    at: new Date().toISOString(),
    operation: opts.operation,
    ok: false,
    status: lastStatus,
    attempts,
    durationMs: Date.now() - started,
    reference: opts.reference,
    detail: lastDetail,
  });
  throw new Error(`Crystal booking ${opts.operation} failed: ${lastDetail}`);
}

export interface SupplierBookingResult {
  supplierReference?: string;
  supplierStatus?: string;
  holdExpiresAt?: string;
  amount?: number;
  currency?: string;
  raw: unknown;
}

function pick(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  const body = (rec.body ?? rec) as Record<string, unknown>;
  for (const k of keys) {
    const v = body[k] ?? rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function num(obj: unknown, keys: string[]): number | undefined {
  const v = pick(obj, keys);
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function normaliseSupplierBooking(raw: unknown): SupplierBookingResult {
  return {
    supplierReference: pick(raw, [
      "bookingReference",
      "bookingNumber",
      "reservationNumber",
      "confirmationNumber",
      "reference",
      "bookingId",
    ]),
    supplierStatus: pick(raw, ["status", "bookingStatus", "statusMessage", "reservationStatus"]),
    holdExpiresAt: pick(raw, ["holdExpiresAt", "optionDueDate", "expiryDate", "optionDate"]),
    amount: num(raw, ["totalPrice", "totalAmount", "amount", "grandTotal"]),
    currency: pick(raw, ["currency", "currencyCode"]),
    raw,
  };
}

/**
 * get-v1-cruise-available-suites — GET /d/v1/cruises/availablesuites.
 * Lists the concrete suite numbers open for a voyage + suite category + price
 * type + currency. Read-only; the result feeds suite selection before a hold.
 */
export async function listAvailableSuites(
  input: CrystalAvailableSuitesInput,
): Promise<CrystalAvailableSuite[]> {
  const parsed = availableSuitesInputSchema.parse(input);
  const raw = await bookingCall<unknown>({
    operation: "availablesuites",
    query: {
      voyageNumber: parsed.voyageNumber,
      suiteCategoryCod: parsed.suiteCategoryCod,
      priceTypeCod: parsed.priceTypeCod,
      currency: parsed.currency.toUpperCase(),
      onlyAda: parsed.onlyAda ? "true" : undefined,
    },
    reference: parsed.voyageNumber,
  });
  return normaliseAvailableSuites(raw);
}

export interface CrystalReadOnlyProbe {
  operation: CrystalBookingOperation;
  attempted: boolean;
  ok: boolean;
  status?: number;
  detail: string;
}

/**
 * Safe PROD validation: calls only configured READ-ONLY documented operations
 * that require no path parameters, never a state-changing one, and never while
 * the rail is disabled. Returns a credential-free result per operation.
 */
export async function verifyBookingReadOnly(
  operations: CrystalBookingOperation[] = CRYSTAL_READ_ONLY_OPERATIONS,
): Promise<CrystalReadOnlyProbe[]> {
  const cap = bookingCapability();
  const configured = new Set(cap.operations);
  const results: CrystalReadOnlyProbe[] = [];
  for (const operation of operations) {
    if (!isReadOnlyOperation(operation)) {
      results.push({
        operation,
        attempted: false,
        ok: false,
        detail: "Skipped: operation mutates supplier state.",
      });
      continue;
    }
    const spec = specFor(operation);
    if (spec && spec.requiredPathParams.length > 0) {
      results.push({
        operation,
        attempted: false,
        ok: false,
        detail: "Skipped: requires a bookingId that is only available after a booking exists.",
      });
      continue;
    }
    if (CRYSTAL_CRITERIA_REQUIRED_OPERATIONS.includes(operation)) {
      results.push({
        operation,
        attempted: false,
        ok: false,
        detail:
          "Not applicable: the supplier requires voyage or guest search criteria, which a parameter-free verification call cannot supply.",
      });
      continue;
    }
    if (!cap.live || !configured.has(operation)) {
      results.push({
        operation,
        attempted: false,
        ok: false,
        detail: cap.live ? "Not configured." : cap.detail,
      });
      continue;
    }
    try {
      await bookingCall({ operation });
      results.push({
        operation,
        attempted: true,
        ok: true,
        detail: "Authenticated read succeeded.",
      });
    } catch (err) {
      results.push({
        operation,
        attempted: true,
        ok: false,
        detail: err instanceof Error ? err.message : "read failed",
      });
    }
  }
  return results;
}

/**
 * Strictly GET-only PROD probe used by the admin readiness check.
 *
 * Unlike `verifyBookingReadOnly` this runs even while the rail is disabled — it
 * is the only way to establish connectivity and entitlement *before* activation.
 * It refuses anything that is not a documented, parameter-free GET operation, so
 * it can never mutate supplier state or place a booking.
 */
export async function probeBookingConnectivity(
  operation: CrystalBookingOperation = "pricetypes",
): Promise<CrystalReadOnlyProbe & { authenticated: boolean; reachable: boolean }> {
  const spec = specFor(operation);
  const method = operationMethod(operation);
  if (
    !spec ||
    method !== "GET" ||
    spec.requiredPathParams.length > 0 ||
    !isReadOnlyOperation(operation)
  ) {
    return {
      operation,
      attempted: false,
      ok: false,
      authenticated: false,
      reachable: false,
      detail: "Skipped: only documented parameter-free GET operations may be probed.",
    };
  }
  const key = apiKey();
  if (!key) {
    return {
      operation,
      attempted: false,
      ok: false,
      authenticated: false,
      reachable: false,
      detail: "The authorised AKTG subscription key is not present in this environment.",
    };
  }
  const base = (env("CRYSTAL_BOOKING_BASE_URL") || DEFAULT_BASE_URL).replace(/\/?$/, "/");
  const url = new URL((operationPath(operation) ?? spec.path).replace(/^\//, ""), base);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { ApiKey: key, Accept: "application/json", ...channelHeaders() },
      signal: controller.signal,
    });
    const ok = res.ok;
    const authenticated = res.status !== 401 && res.status !== 403;
    audit({
      at: new Date().toISOString(),
      operation: "capability",
      ok,
      status: res.status,
      attempts: 1,
      durationMs: Date.now() - started,
      detail: `readiness probe ${operation}`,
    });
    return {
      operation,
      attempted: true,
      ok,
      status: res.status,
      reachable: true,
      authenticated,
      detail: ok
        ? "Authenticated read succeeded."
        : `Supplier responded ${res.status}${
            authenticated ? "." : " — not authorised for the Booking API on this key."
          }`,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "request failed";
    audit({
      at: new Date().toISOString(),
      operation: "capability",
      ok: false,
      attempts: 1,
      durationMs: Date.now() - started,
      detail: `readiness probe ${operation}: ${detail}`,
    });
    return {
      operation,
      attempted: true,
      ok: false,
      reachable: false,
      authenticated: false,
      detail,
    };
  } finally {
    clearTimeout(timer);
  }
}
