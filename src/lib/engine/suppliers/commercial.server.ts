// Worldway commercial rules for journey pricing — reuses each supplier's existing
// server-side rule. A supplier with no defined rule returns null, which blocks
// pricing (and therefore booking readiness) instead of silently using 0%.
//
// These are Worldway CUSTOMER-PRICING rules (markup), not supplier contractual
// commissions. Commission stays 0% until an official supplier commission is
// provided — markup and commission are never double-counted.
import type { PricingRule } from "../pricing";
import type { NormalizedComponent } from "../types";
import { WORLDWAY_MARKUP_PERCENT as AIRIQ_MARKUP } from "@/lib/airiq/client.server";
import { worldwayPricingConfig as ratehawkPricing } from "@/lib/ratehawk/hotels.server";
import { tourPricingRule } from "@/lib/travelshop/catalogue.server";

export type CommercialSource = "airiq-fixed" | "ratehawk-config" | "travelshop-config" | "worldway-initial-2026-09";

/** Price basis the rule is applied to (recorded for the pricing audit). */
export type PriceBasis = "supplier-net" | "published-fare" | "retail-price";

interface RuleEntry { rule: PricingRule; source: CommercialSource; basis: PriceBasis }

const initial = (markupPercent: number, basis: PriceBasis): (() => RuleEntry) =>
  () => ({ rule: { markupPercent, commissionPercent: 0, serviceFee: 0 }, source: "worldway-initial-2026-09", basis });

const RULES: Record<string, () => RuleEntry | null> = {
  airiq: () => ({ rule: { markupPercent: AIRIQ_MARKUP, commissionPercent: 0, serviceFee: 0 }, source: "airiq-fixed", basis: "supplier-net" }),
  ratehawk: () => {
    const c = ratehawkPricing();
    return { rule: { markupPercent: c.markupPercent + c.serviceFeePercent, commissionPercent: 0, serviceFee: c.fixedFee }, source: "ratehawk-config", basis: "supplier-net" };
  },
  // Approved Worldway tour markup (TRAVELSHOP_MARKUP_PERCENT); unset → no rule → pricing blocked.
  travelshop: () => {
    const t = tourPricingRule();
    return t.markupPercent === null ? null : { rule: { markupPercent: t.markupPercent, commissionPercent: 0, serviceFee: 0 }, source: "travelshop-config", basis: "retail-price" };
  },
  // Approved initial Worldway rules (29 Sep 2026).
  crystal: initial(10, "published-fare"), // Crystal PROD returns published fares (net-fare variants excluded)
  up17: initial(5, "supplier-net"),
  "viator-affiliate": initial(12, "retail-price"),
  "viator-merchant": initial(12, "supplier-net"),
  "hbx-hotels": initial(10, "supplier-net"),
  "hbx-transfers": initial(10, "supplier-net"),
};

export function commercialRuleFor(c: Pick<NormalizedComponent, "supplierKey">): PricingRule | null {
  return RULES[c.supplierKey]?.()?.rule ?? null;
}

export function commercialCoverage(keys: string[]) {
  return keys.map((k) => {
    const r = RULES[k]?.();
    return { supplierKey: k, source: r?.source ?? null, basis: r?.basis ?? null, markupPercent: r?.rule.markupPercent ?? null };
  });
}
