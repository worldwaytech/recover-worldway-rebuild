// Dedicated margin optimiser. Pure and deterministic.
// Works per priced line: markup can only move DOWN from the approved Worldway markup
// toward an approved floor (never above approved, never below floor, never below
// supplier net + taxes). If no floor is approved, floor = approved, so the optimiser
// only reports budget fit and never discounts. It never changes supplier prices.
import type { PricedComponent } from "../pricing";

export interface MarginResult {
  approvedTotal: number;
  /** Lowest total reachable within approved limits. */
  floorTotal: number;
  budget: number | null;
  withinBudgetAtApproved: boolean;
  /** Fraction (0..1) of the available markup band kept. 1 = full approved markup. */
  keep: number | null;
  suggestedTotal: number | null;
  /** Markup kept as a share of approved markup, in percent; null when budget can't be met. */
  marginKeptPercent: number | null;
  reason: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const step = (l: PricedComponent, label: string) => l.steps.find((s) => s.label === label)?.amount ?? 0;

export function optimiseMargin(lines: PricedComponent[], budget: number | null, floorPercentOfApproved = 100): MarginResult {
  const floorShare = Math.min(100, Math.max(0, floorPercentOfApproved)) / 100;
  const approvedTotal = r2(lines.reduce((s, l) => s + l.customerPrice, 0));
  const markup = lines.reduce((s, l) => s + step(l, "Markup"), 0);
  const floorTotal = r2(approvedTotal - markup * (1 - floorShare));
  if (budget == null) return { approvedTotal, floorTotal, budget, withinBudgetAtApproved: true, keep: 1, suggestedTotal: approvedTotal, marginKeptPercent: 100, reason: "No budget given — approved markup applies." };
  if (approvedTotal <= budget) return { approvedTotal, floorTotal, budget, withinBudgetAtApproved: true, keep: 1, suggestedTotal: approvedTotal, marginKeptPercent: 100, reason: "Within budget at the approved markup." };
  if (floorTotal > budget || markup <= 0) return { approvedTotal, floorTotal, budget, withinBudgetAtApproved: false, keep: null, suggestedTotal: null, marginKeptPercent: null, reason: "Over budget even at the lowest approved markup." };
  // Keep the largest share of markup that still fits the budget.
  const kept = Math.floor(((budget - (approvedTotal - markup)) / markup) * 1000) / 1000;
  const keep = Math.max(floorShare, Math.min(1, kept));
  const suggestedTotal = r2(approvedTotal - markup * (1 - keep));
  return { approvedTotal, floorTotal, budget, withinBudgetAtApproved: false, keep, suggestedTotal, marginKeptPercent: r2(keep * 100), reason: "Fits the budget by reducing markup within approved limits — needs staff approval." };
}
