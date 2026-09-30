// Live fare/availability revalidation — runs before pricing and booking readiness.
// Uses ONLY existing supplier calls. Changed offers are refreshed (and flagged for
// approval); missing/expired offers are rejected. Nothing is ever invented.
import type { CanonicalOffer } from "../normalize";
import { registrationFor } from "./catalog.server";

export type RevalidationStatus = "confirmed" | "changed" | "rejected" | "not_live";

export interface RevalidationResult {
  externalId: string;
  status: RevalidationStatus;
  reason: string;
  before: { amount: number; currency: string };
  after: { amount: number; currency: string } | null;
  checkedAt: string;
}

/** Pure: apply one supplier re-check to an offer. */
export function reconcile(o: CanonicalOffer, live: { found: boolean; net?: number; currency?: string; reason?: string }, checkedAt: string): { offer: CanonicalOffer | null; result: RevalidationResult } {
  const base = { externalId: o.externalId, before: o.net, checkedAt };
  if (!live.found || !(live.net! > 0) || !live.currency) {
    return { offer: null, result: { ...base, status: "rejected", reason: live.reason ?? "No longer available from supplier", after: null } };
  }
  const after = { amount: live.net!, currency: live.currency };
  const changed = after.currency !== o.net.currency || Math.abs(after.amount - o.net.amount) > 0.009;
  return {
    offer: { ...o, net: after, revalidatedAt: checkedAt },
    result: { ...base, status: changed ? "changed" : "confirmed", reason: changed ? "Supplier price changed; refreshed — customer approval required" : "Live price and availability confirmed", after },
  };
}

async function liveCheck(o: CanonicalOffer): Promise<{ found: boolean; net?: number; currency?: string; reason?: string } | "not_live"> {
  const reg = registrationFor(o.supplierKey);
  if (reg.readiness !== "production") return "not_live";
  if (o.kind === "flight") {
    const { flightOfferHandle } = await import("@/lib/flights/flight-adapters.server");
    const h = flightOfferHandle(o.externalId);
    if (!h) return { found: false, reason: "Offer reference expired; search again" };
    if (h.supplier === "up17") {
      if (!h.searchTokenId) return { found: false, reason: "Fare token missing; search again" };
      const { up17ConfirmFare } = await import("@/lib/up17/up17.server");
      const r = await up17ConfirmFare({ resultIndex: h.resultIndex, searchTokenId: h.searchTokenId });
      if (!r.ok || !r.data || r.data.total == null) return { found: false, reason: "Fare could not be confirmed" };
      return { found: true, net: r.data.total, currency: r.data.currency };
    }
    const { airiqSearch, fareTotal } = await import("@/lib/airiq/client.server");
    const pax = { adult: h.query.passengers, child: 0, infant: 0 };
    const f = (await airiqSearch({ origin: h.query.origin, destination: h.query.destination, date: h.query.depart_date, ...pax })).find((x) => x.ticketId === h.ticketId && x.seats >= pax.adult);
    return f ? { found: true, net: fareTotal(f, pax), currency: "INR" } : { found: false, reason: "Fare sold out" };
  }
  if (o.kind === "stay") {
    const { hotelHandle } = await import("./live-search.server");
    const h = hotelHandle(o.externalId);
    if (!h) return { found: false, reason: "Hotel reference expired; search again" };
    const { up17SearchHotels, up17ServerIp } = await import("@/lib/up17/up17.server");
    const r = await up17SearchHotels({ destination: h.destination, check_in: h.checkin, check_out: h.checkout, guests: h.guests, rooms: 1, user_ip: await up17ServerIp() } as never);
    const hit = r.ok ? r.data?.hotels.find((x) => x.hotelCode === h.hotelCode) : undefined;
    return hit?.totalPrice ? { found: true, net: hit.totalPrice, currency: hit.currency } : { found: false, reason: "Hotel no longer available" };
  }
  if (o.kind === "cruise") {
    const { revalidateAktgVoyage } = await import("@/lib/crystal/aktg.server");
    const [voyage, grade] = o.externalId.split(":");
    const r = await revalidateAktgVoyage(voyage!, o.net.currency);
    const fare = r.live ? r.fares.find((f) => (f.gradeId ?? f.suiteCategory) === grade) : undefined;
    return fare && r.availability !== "closed" ? { found: true, net: fare.price, currency: r.currency } : { found: false, reason: r.error ? "Voyage fare could not be confirmed" : "Suite no longer available" };
  }
  if (o.kind === "activity" && o.supplierKey === "travelshop") {
    const [slug, date, service, adults, children] = o.externalId.replace(/^tour:/, "").split("|");
    const { liveQuote } = await import("@/lib/travelshop/catalogue.server");
    const q = await liveQuote({ slug: slug!, date: date!, service: service === "private" ? "private" : "regular", adults: Number(adults) || 1, children: Number(children) || 0, infants: 0 });
    return q.ok ? { found: true, net: q.retailTotal, currency: q.currency } : { found: false, reason: q.reason };
  }
  return { found: false, reason: "No live revalidation path for this product" };
}

export async function revalidateOffers(offers: CanonicalOffer[]) {
  const out: { offer: CanonicalOffer | null; result: RevalidationResult }[] = [];
  for (const o of offers) {
    const checkedAt = new Date().toISOString();
    const live = await liveCheck(o).catch(() => ({ found: false, reason: "Supplier check failed" }) as const);
    if (live === "not_live") {
      out.push({ offer: o, result: { externalId: o.externalId, status: "not_live", reason: "Sandbox/UAT supplier — on request, not bookable", before: o.net, after: null, checkedAt } });
    } else out.push(reconcile(o, live, checkedAt));
  }
  return out;
}
