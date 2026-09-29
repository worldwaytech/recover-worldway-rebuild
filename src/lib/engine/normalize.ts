// Canonical offer model. Adapters map supplier results into CanonicalOffer;
// the engine converts it into a Trip Graph component. Times are always real
// supplier instants with timezones — never package dates.
import type { ComponentKind, LocalMoment, Money, NormalizedComponent } from "./types";

export interface CanonicalOffer {
  supplierKey: string;
  kind: ComponentKind;
  externalId: string;
  title: string;
  start: LocalMoment;
  end: LocalMoment;
  net: Money;
  taxes?: Money;
  refundable: boolean;
  freeCancelUntil?: string;
  quality?: number;
  /** When the live search result was observed (search results expire; see revalidate). */
  observedAt?: string;
  /** Set only when the supplier confirmed live availability + price. */
  revalidatedAt?: string;
}

export class NormalizationError extends Error {}

export function toComponent(o: CanonicalOffer): NormalizedComponent {
  for (const [label, m] of [["start", o.start], ["end", o.end]] as const) {
    if (!m?.at || Number.isNaN(Date.parse(m.at))) throw new NormalizationError(`${o.title}: invalid ${label} time`);
    if (!m.timezone) throw new NormalizationError(`${o.title}: ${label} has no timezone`);
  }
  if (!(o.net?.amount >= 0) || !o.net.currency) throw new NormalizationError(`${o.title}: no supplier price`);
  return {
    id: `${o.supplierKey}:${o.kind}:${o.externalId}`,
    kind: o.kind,
    supplierKey: o.supplierKey,
    externalId: o.externalId,
    title: o.title,
    start: o.start,
    end: o.end,
    net: o.net,
    taxes: o.taxes ?? { amount: 0, currency: o.net.currency },
    cancellation: { refundable: o.refundable, freeUntil: o.freeCancelUntil },
    quality: o.quality,
    revalidatedAt: o.revalidatedAt,
  };
}

/** Normalise a batch; invalid offers are dropped and reported, never guessed. */
export function normalizeOffers(offers: CanonicalOffer[]) {
  const components: NormalizedComponent[] = [];
  const rejected: { externalId: string; reason: string }[] = [];
  for (const o of offers) {
    try {
      components.push(toComponent(o));
    } catch (e) {
      rejected.push({ externalId: o.externalId, reason: e instanceof Error ? e.message : "invalid" });
    }
  }
  return { components, rejected };
}
