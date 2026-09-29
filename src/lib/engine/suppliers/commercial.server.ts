// Worldway commercial rules for journey pricing — reuses each supplier's existing
// server-side rule. A supplier with no defined rule returns null, which blocks
// pricing (and therefore booking readiness) instead of silently using 0%.
import type { PricingRule } from "../pricing";
import type { NormalizedComponent } from "../types";
import { WORLDWAY_MARKUP_PERCENT as AIRIQ_MARKUP } from "@/lib/airiq/client.server";
import { worldwayPricingConfig as ratehawkPricing } from "@/lib/ratehawk/hotels.server";

export type CommercialSource = "airiq-fixed" | "ratehawk-config";

const RULES: Record<string, () => { rule: PricingRule; source: CommercialSource }> = {
  airiq: () => ({ rule: { markupPercent: AIRIQ_MARKUP, commissionPercent: 0, serviceFee: 0 }, source: "airiq-fixed" }),
  ratehawk: () => {
    const c = ratehawkPricing();
    return { rule: { markupPercent: c.markupPercent + c.serviceFeePercent, commissionPercent: 0, serviceFee: c.fixedFee }, source: "ratehawk-config" };
  },
};

export function commercialRuleFor(c: Pick<NormalizedComponent, "supplierKey">): PricingRule | null {
  return RULES[c.supplierKey]?.().rule ?? null;
}

export function commercialCoverage(keys: string[]) {
  return keys.map((k) => ({ supplierKey: k, source: RULES[k]?.().source ?? null }));
}
