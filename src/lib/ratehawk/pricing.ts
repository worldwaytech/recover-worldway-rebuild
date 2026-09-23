// Worldway customer pricing for RateHawk inventory — pure, client-safe maths.
//
// RateHawk is only ever sent its own net/deposit cost. Markup and fees are
// applied here, on our side, to produce the customer-facing selling price shown
// on the voucher. Nothing in this module is sent to the supplier.
import type { RatehawkMoney } from "./types";

export interface WorldwayPricingConfig {
  /** Percentage added to the supplier net cost. */
  markupPercent: number;
  /** Additional service-fee percentage (applied to the net cost). */
  serviceFeePercent: number;
  /** Flat fee in the supplier currency. */
  fixedFee: number;
}

/**
 * Neutral defaults: no invented commercial figures. Operators set the real
 * values through the RATEHAWK_MARKUP_PERCENT / RATEHAWK_SERVICE_FEE_PERCENT /
 * RATEHAWK_FIXED_FEE secrets; until then the customer price equals the supplier
 * cost rather than a guessed number.
 */
export const WORLDWAY_DEFAULT_PRICING: WorldwayPricingConfig = {
  markupPercent: 0,
  serviceFeePercent: 0,
  fixedFee: 0,
};

export interface WorldwayCustomerPrice {
  /** Exactly what RateHawk charges us — the only figure sent to the supplier. */
  supplierNet: RatehawkMoney;
  markupPercent: number;
  markupAmount: number;
  serviceFeePercent: number;
  serviceFeeAmount: number;
  fixedFee: number;
  /** What the customer pays Worldway. */
  customerTotal: number;
  currency: string | null;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const clampPercent = (value: number): number =>
  Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;

/**
 * Builds the customer-facing price from the supplier net cost. Returns null when
 * the supplier gave us no usable amount — we never invent a price.
 */
export function computeCustomerPrice(
  supplierNet: RatehawkMoney,
  config: WorldwayPricingConfig = WORLDWAY_DEFAULT_PRICING,
): WorldwayCustomerPrice | null {
  const net = supplierNet.amount;
  if (net == null || !Number.isFinite(net) || net < 0) return null;

  const markupPercent = clampPercent(config.markupPercent);
  const serviceFeePercent = clampPercent(config.serviceFeePercent);
  const fixedFee = Number.isFinite(config.fixedFee) && config.fixedFee >= 0 ? config.fixedFee : 0;

  const markupAmount = round2((net * markupPercent) / 100);
  const serviceFeeAmount = round2((net * serviceFeePercent) / 100);

  return {
    supplierNet: { amount: round2(net), currency: supplierNet.currency },
    markupPercent,
    markupAmount,
    serviceFeePercent,
    serviceFeeAmount,
    fixedFee: round2(fixedFee),
    customerTotal: round2(net + markupAmount + serviceFeeAmount + fixedFee),
    currency: supplierNet.currency,
  };
}
