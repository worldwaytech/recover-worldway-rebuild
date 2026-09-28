// Shared pricing: net + taxes + FX + commission + markup = customer price.
// Every step is recorded so the final price is auditable.
import type { Money, NormalizedComponent } from "./types";

export interface PricingRule {
  /** Markup % applied to (net+taxes) after FX. */
  markupPercent: number;
  /** Commission % paid out (e.g. agent) — included in customer price. */
  commissionPercent: number;
  serviceFee: number;
}

export type FxTable = Record<string, number>; // currency -> rate into target

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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  ruleFor: (c: NormalizedComponent) => PricingRule,
) {
  const lines = items.map((c) => priceComponent(c, target, fx, ruleFor(c)));
  return { currency: target, lines, total: round2(lines.reduce((s, l) => s + l.customerPrice, 0)) };
}
