// Worldway broker rate sheet — SERVER-ONLY. Intentionally EMPTY.
// Indicative pricing is switched off until Worldway supplies an approved broker
// rate sheet. When it arrives, add rows here (or load from a table); every
// consumer already labels these prices "Indicative" and keeps them separate
// from live supplier pricing. Never add estimated or invented rates.

export type RateSheetRow = {
  /** Aircraft catalogue slug or category name. */
  key: string;
  currency: string;
  hourly: number;
  approvedBy: string;
  approvedAt: string;
};

export const RATE_SHEET: RateSheetRow[] = [];

export type IndicativePrice = { kind: "indicative"; currency: string; hourly: number; approvedAt: string };

export function indicativeFor(slug: string, category: string): IndicativePrice | null {
  const row = RATE_SHEET.find((r) => r.key === slug) ?? RATE_SHEET.find((r) => r.key === category);
  return row ? { kind: "indicative", currency: row.currency, hourly: row.hourly, approvedAt: row.approvedAt } : null;
}
