// AKTG (A&K Travel Group) Booking API adapter — server only.
//
// The Shopping API (see aktg-client.server.ts) is production live. The Booking
// API is configuration-driven and FAIL-CLOSED: no endpoint path is hard-coded or
// guessed. Every documented operation is called only when its production path is
// supplied through runtime configuration, so no undocumented endpoint can ever
// be invoked and no unauthorised booking can be attempted.
//
// Runtime configuration (all server-side secrets/env, never in the bundle):
//   CRYSTAL_BOOKING_ENABLED         "true" to arm the rail
//   CRYSTAL_BOOKING_BASE_URL        AKTG Booking API base URL (PROD)
//   CRYSTAL_BOOKING_PATH_PREBOOK    hold / pre-book operation path
//   CRYSTAL_BOOKING_PATH_CREATE     booking creation operation path
//   CRYSTAL_BOOKING_PATH_RETRIEVE   retrieve / history operation path
//   CRYSTAL_BOOKING_PATH_LIST       booking list operation path
//   CRYSTAL_BOOKING_PATH_CANCEL     cancellation operation path
// Authentication reuses the authorised CRYSTAL_AKTG_API_KEY ApiKey header.
import type {
  CrystalBookingBlockReason,
  CrystalBookingCapability,
  CrystalBookingOperation,
  CrystalOperationStatus,
} from "./booking-contract";
import {
  CRYSTAL_ALL_OPERATIONS,
  CRYSTAL_READ_ONLY_OPERATIONS,
  CRYSTAL_REQUIRED_OPERATIONS,
} from "./booking-contract";
import { CRYSTAL_BOOKING_API_STATUS, CRYSTAL_SHOPPING_API_STATUS } from "./connector.server";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

const PATH_ENV: Record<CrystalBookingOperation, string> = {
  prebook: "CRYSTAL_BOOKING_PATH_PREBOOK",
  create: "CRYSTAL_BOOKING_PATH_CREATE",
  retrieve: "CRYSTAL_BOOKING_PATH_RETRIEVE",
  list: "CRYSTAL_BOOKING_PATH_LIST",
  cancel: "CRYSTAL_BOOKING_PATH_CANCEL",
};

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

export function configuredOperations(): CrystalBookingOperation[] {
  if (!env("CRYSTAL_BOOKING_BASE_URL")) return [];
  return (Object.keys(PATH_ENV) as CrystalBookingOperation[]).filter((op) =>
    Boolean(env(PATH_ENV[op])),
  );
}

export function bookingCapability(): CrystalBookingCapability {
  const base: Pick<CrystalBookingCapability, "shoppingApiStatus" | "bookingApiStatus"> = {
    shoppingApiStatus: CRYSTAL_SHOPPING_API_STATUS,
    bookingApiStatus: CRYSTAL_BOOKING_API_STATUS,
  };
  const ops = configuredOperations();
  if (!apiKey()) {
    return {
      ...base,
      live: false,
      operations: [],
      reason: "credentials_missing",
      detail: "The authorised AKTG subscription key is not present in this environment.",
    };
  }
  if (env("CRYSTAL_BOOKING_ENABLED").toLowerCase() !== "true") {
    return {
      ...base,
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
      live: false,
      operations: [],
      reason: "booking_api_not_configured",
      detail:
        "No AKTG Booking API base URL or documented operation paths have been supplied, so no booking endpoint can be called.",
    };
  }
  const required: CrystalBookingOperation[] = ["prebook", "create", "retrieve", "cancel"];
  const missing = required.filter((op) => !ops.includes(op));
  if (missing.length) {
    return {
      ...base,
      live: false,
      operations: ops,
      reason: "booking_api_not_authorised",
      detail: `AKTG Booking API operations still missing: ${missing.join(", ")}.`,
    };
  }
  return { ...base, live: true, operations: ops, detail: "AKTG Booking API armed." };
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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Supplier-side idempotency key; also used for our own audit correlation. */
  idempotencyKey?: string;
  reference?: string;
}

/** Perform one documented booking operation with retries, timeout and audit. */
export async function bookingCall<T>(opts: CallOptions): Promise<T> {
  assertBookingLive(opts.operation);
  const started = Date.now();
  const key = apiKey();
  const path = env(PATH_ENV[opts.operation]);
  const url = new URL(path, env("CRYSTAL_BOOKING_BASE_URL").replace(/\/?$/, "/"));
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

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
      };
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

      const res = await fetch(url.toString(), {
        method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
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
