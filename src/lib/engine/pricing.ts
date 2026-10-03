// Worldway Dynamic Pricing, Margin & Revenue Intelligence.
// Backward-compatible with the original net + taxes + FX + markup + commission model.
// Dynamic decisions are deterministic and bounded by explicit commercial policy.

import type { Money, NormalizedComponent } from "./types";

export interface PricingRule {
  /** Markup % applied to (net+taxes) after FX. */
  markupPercent: number;
  /** Commission % paid out (e.g. agent) — included in customer price. */
  commissionPercent: number;
  serviceFee: number;
}

export type FxTable = Record<string, number>;

export interface PriceStep {
  label: string;
  amount: number;
}

export interface PricedComponent {
  componentId: string;
  currency: string;
  steps: PriceStep[];
  customerPrice: number;
}

export type PricingChannel =
  | "customer_b2c"
  | "partner_b2b"
  | "white_label"
  | "agent"
  | "internal";

export interface PricingPolicy {
  currency: string;
  channel: PricingChannel;
  baseRule: PricingRule;
  /** Minimum gross margin on customer sell price. */
  minimumMarginPercent: number;
  /** Maximum permitted markup movement from base rule. */
  maxDynamicMarkupDeltaPercent: number;
  /** Optional channel-specific multiplier on the base markup. */
  channelMarkupMultiplier?: number;
  /** Fixed commercial adjustment applied after markup/commission. */
  channelFee?: number;
  promotions?: Promotion[];
}

export interface Promotion {
  id: string;
  percentOff: number;
  maxDiscountAmount?: number;
  startsAt?: string;
  endsAt?: string;
  minimumSubtotal?: number;
  channels?: PricingChannel[];
}

export interface DemandSignals {
  demandIndex?: number;
  inventoryPressure?: number;
  leadTimeDays?: number;
  conversionIndex?: number;
}

export interface DynamicPricingInput {
  component: NormalizedComponent;
  fx: FxTable;
  policy: PricingPolicy;
  signals?: DemandSignals;
  now?: string;
}

export interface DynamicPriceQuote {
  componentId: string;
  currency: string;
  channel: PricingChannel;
  supplierCost: number;
  markup: number;
  commission: number;
  channelFee: number;
  promotionDiscount: number;
  customerPrice: number;
  grossProfit: number;
  grossMarginPercent: number;
  effectiveMarkupPercent: number;
  promotionId?: string;
  audit: string[];
}

export interface RevenueSnapshot {
  bookings: number;
  grossSales: number;
  supplierCost: number;
  commissionCost: number;
  discounts: number;
  grossProfit: number;
  grossMarginPercent: number;
  averageBookingValue: number;
  revenuePerBooking: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function percent(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid percentage");
  return value;
}

function activePromotion(
  promotions: Promotion[] | undefined,
  channel: PricingChannel,
  subtotal: number,
  now: string,
): Promotion | null {
  return (promotions ?? [])
    .filter((p) =>
      percent(p.percentOff) > 0 &&
      (!p.startsAt || Date.parse(p.startsAt) <= Date.parse(now)) &&
      (!p.endsAt || Date.parse(p.endsAt) >= Date.parse(now)) &&
      (!p.minimumSubtotal || subtotal >= p.minimumSubtotal) &&
      (!p.channels || p.channels.includes(channel))
    )
    .sort((a, b) => b.percentOff - a.percentOff)[0] ?? null;
}

export function convert(m: Money, target: string, fx: FxTable): number {
  if (m.currency === target) return m.amount;
  const rate = fx[m.currency];
  if (!rate || rate <= 0) throw new Error(`No FX rate for ${m.currency}→${target}`);
  return m.amount * rate;
}

export function priceComponent(
  c: NormalizedComponent,
  target: string,
  fx: FxTable,
  rule: PricingRule,
): PricedComponent {
  const net = convert(c.net, target, fx);
  const taxes = convert(c.taxes, target, fx);
  const base = net + taxes;
  const markup = base * (rule.markupPercent / 100);
  const commission = base * (rule.commissionPercent / 100);
  const total = round2(base + markup + commission + rule.serviceFee);
  return {
    componentId: c.id,
    currency: target,
    steps: [
      { label: "Supplier net", amount: round2(net) },
      { label: "Taxes & fees", amount: round2(taxes) },
      { label: "Markup", amount: round2(markup) },
      { label: "Commission", amount: round2(commission) },
      { label: "Service fee", amount: round2(rule.serviceFee) },
    ],
    customerPrice: total,
  };
}

export function pricePackage(
  items: NormalizedComponent[],
  target: string,
  fx: FxTable,
  ruleFor: (c: NormalizedComponent) => PricingRule | null,
) {
  const lines = items.map((c) => {
    const rule = ruleFor(c);
    if (!rule) throw new Error(`No Worldway commercial rule for ${c.title}`);
    return priceComponent(c, target, fx, rule);
  });
  return {
    currency: target,
    lines,
    total: round2(lines.reduce((s, l) => s + l.customerPrice, 0)),
  };
}

/**
 * Deterministic dynamic pricing recommendation.
 * AI may supply demand signals, but the final markup is bounded by policy.
 */
export function recommendDynamicMarkup(
  rule: PricingRule,
  signals: DemandSignals = {},
  maxDelta = 10,
): { markupPercent: number; reasons: string[] } {
  const demand = clamp(signals.demandIndex ?? 0.5, 0, 1);
  const inventory = clamp(signals.inventoryPressure ?? 0.5, 0, 1);
  const conversion = clamp(signals.conversionIndex ?? 0.5, 0, 1);
  const leadTime = clamp((signals.leadTimeDays ?? 14) / 30, 0, 1);

  const pressure = (demand * 0.45) + (inventory * 0.3) + (conversion * 0.15) + (leadTime * 0.1);
  const delta = clamp((pressure - 0.5) * 2 * maxDelta, -maxDelta, maxDelta);
  const markupPercent = round2(rule.markupPercent + delta);
  const reasons: string[] = [];
  if (demand > 0.65) reasons.push("high demand signal");
  if (inventory > 0.65) reasons.push("inventory pressure");
  if (conversion > 0.65) reasons.push("strong conversion signal");
  if (leadTime > 0.65) reasons.push("shorter lead time");
  if (!reasons.length) reasons.push("baseline market conditions");
  return { markupPercent, reasons };
}

export function priceDynamicComponent(input: DynamicPricingInput): DynamicPriceQuote {
  const { component, fx, policy, signals = {} } = input;
  const now = input.now ?? new Date().toISOString();
  const supplierCost = round2(convert(component.net, policy.currency, fx) + convert(component.taxes, policy.currency, fx));
  const recommendation = recommendDynamicMarkup(
    policy.baseRule,
    signals,
    Math.max(0, policy.maxDynamicMarkupDeltaPercent),
  );
  const multiplier = policy.channelMarkupMultiplier ?? 1;
  const effectiveMarkupPercent = round2(Math.max(
    0,
    recommendation.markupPercent * multiplier,
  ));
  const markup = round2(supplierCost * effectiveMarkupPercent / 100);
  const commission = round2(supplierCost * percent(policy.baseRule.commissionPercent) / 100);
  const channelFee = round2(policy.channelFee ?? policy.baseRule.serviceFee ?? 0);
  const prePromotion = round2(supplierCost + markup + commission + channelFee);
  const promotion = activePromotion(policy.promotions, policy.channel, prePromotion, now);
  const rawDiscount = promotion ? round2(prePromotion * promotion.percentOff / 100) : 0;
  const promotionDiscount = promotion?.maxDiscountAmount == null
    ? rawDiscount
    : round2(Math.min(rawDiscount, Math.max(0, promotion.maxDiscountAmount)));
  const customerPrice = round2(prePromotion - promotionDiscount);
  const grossProfit = round2(customerPrice - supplierCost - commission);
  const grossMarginPercent = customerPrice > 0 ? round2(grossProfit / customerPrice * 100) : 0;

  if (grossMarginPercent + 1e-9 < policy.minimumMarginPercent) {
    throw new Error(`Pricing policy minimum margin violated: ${grossMarginPercent}% < ${policy.minimumMarginPercent}%`);
  }

  return {
    componentId: component.id,
    currency: policy.currency,
    channel: policy.channel,
    supplierCost,
    markup,
    commission,
    channelFee,
    promotionDiscount,
    customerPrice,
    grossProfit,
    grossMarginPercent,
    effectiveMarkupPercent,
    promotionId: promotion?.id,
    audit: [
      `channel:${policy.channel}`,
      `base-markup:${policy.baseRule.markupPercent}%`,
      `dynamic-markup:${effectiveMarkupPercent}%`,
      ...recommendation.reasons,
      promotion ? `promotion:${promotion.id}` : "promotion:none",
      `margin-floor:${policy.minimumMarginPercent}%`,
    ],
  };
}

export function pricePackageDynamically(
  items: NormalizedComponent[],
  fx: FxTable,
  policy: PricingPolicy,
  signalsFor?: (c: NormalizedComponent) => DemandSignals | undefined,
  now?: string,
) {
  const quotes = items.map((component) => priceDynamicComponent({
    component,
    fx,
    policy,
    signals: signalsFor?.(component),
    now,
  }));
  return {
    currency: policy.currency,
    channel: policy.channel,
    lines: quotes,
    total: round2(quotes.reduce((sum, q) => sum + q.customerPrice, 0)),
    grossProfit: round2(quotes.reduce((sum, q) => sum + q.grossProfit, 0)),
  };
}

export function calculateRevenueSnapshot(quotes: DynamicPriceQuote[]): RevenueSnapshot {
  const bookings = quotes.length;
  const grossSales = round2(quotes.reduce((s, q) => s + q.customerPrice, 0));
  const supplierCost = round2(quotes.reduce((s, q) => s + q.supplierCost, 0));
  const commissionCost = round2(quotes.reduce((s, q) => s + q.commission, 0));
  const discounts = round2(quotes.reduce((s, q) => s + q.promotionDiscount, 0));
  const grossProfit = round2(quotes.reduce((s, q) => s + q.grossProfit, 0));
  return {
    bookings,
    grossSales,
    supplierCost,
    commissionCost,
    discounts,
    grossProfit,
    grossMarginPercent: grossSales > 0 ? round2(grossProfit / grossSales * 100) : 0,
    averageBookingValue: bookings ? round2(grossSales / bookings) : 0,
    revenuePerBooking: bookings ? round2(grossProfit / bookings) : 0,
  };
}
