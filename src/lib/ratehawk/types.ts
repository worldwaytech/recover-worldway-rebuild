// RateHawk (ETG v3) — shared, client-safe result shapes.
import type { RatehawkEnvironment, RatehawkOperation } from "./config";
import type { WorldwayCustomerPrice } from "./pricing";
import type { RatehawkInternalStatus, WorldwayVoucher } from "./voucher";

export interface RatehawkCallMeta {
  /** ETG envelope status ("ok" | "processing"), when the supplier returned one. */
  supplierStatus?: string | null;
  operation: RatehawkOperation;
  environment: RatehawkEnvironment;
  httpStatus: number | null;
  latencyMs: number;
  attempts: number;
}

export type RatehawkResult<T> =
  | { ok: true; data: T; meta: RatehawkCallMeta }
  | { ok: false; error: RatehawkError; meta: RatehawkCallMeta };

export interface RatehawkError {
  /** ETG puts a machine-readable slug in the `error` field of every response. */
  code: string;
  message: string;
  retryable: boolean;
  /** Whether the failure is ours (credentials/request) or the supplier's. */
  origin: "credentials" | "request" | "supplier" | "network" | "disabled";
}

export interface RatehawkMoney {
  amount: number | null;
  currency: string | null;
}

export interface RatehawkTaxLine {
  name: string;
  amount: number | null;
  currency: string | null;
  includedInPrice: boolean;
}

export interface RatehawkCancellationPolicy {
  startAt: string | null;
  endAt: string | null;
  penalty: RatehawkMoney;
}

export interface RatehawkRate {
  bookHash: string;
  matchHash: string | null;
  roomName: string;
  mealType: string | null;
  refundable: boolean | null;
  price: RatehawkMoney;
  taxesAndFees: RatehawkTaxLine[];
  cancellationPolicies: RatehawkCancellationPolicy[];
  paymentType: string | null;
  allotment: number | null;
}

export interface RatehawkHotelOffer {
  hid: number | null;
  hotelId: string;
  rates: RatehawkRate[];
}

export interface RatehawkCertificationStep {
  step: string;
  endpoint: string;
  httpStatus: number | null;
  passed: boolean;
  detail: string;
  latencyMs: number;
}

export interface RatehawkCertificationReport {
  environment: RatehawkEnvironment;
  passed: boolean;
  startedAt: string;
  finishedAt: string;
  partnerOrderId: string | null;
  orderId: string | number | null;
  steps: RatehawkCertificationStep[];
  message: string;
  /** Worldway's own resolved lifecycle status, when a booking was submitted. */
  internalStatus?: RatehawkInternalStatus;
  supplierStatus?: string | null;
  /** Customer-facing price (supplier cost + Worldway markup/fees). */
  customerPrice?: WorldwayCustomerPrice | null;
  /** Worldway voucher — only present for a confirmed booking. */
  voucher?: WorldwayVoucher | null;
}
