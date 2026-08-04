// Deterministic day-by-day itinerary + departure calendar + price breakdown
// derived from a catalogue product. Client-safe, no network.
import type { CatalogueProduct } from "./catalogue-types";

export interface ItineraryDay {
  day: number;
  title: string;
  summary: string;
  meals: string;
  stay: string;
}

export interface DepartureOption {
  date: string; // ISO yyyy-mm-dd
  label: string;
  seatsLeft: number;
  priceDelta: number; // % applied to base price
  status: "available" | "limited" | "guaranteed";
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function itineraryLength(p: CatalogueProduct): number {
  if (p.durationNights && p.durationNights > 0) return Math.min(p.durationNights + 1, 24);
  const m = /(\d+)\s*(day|night)/i.exec(p.duration ?? "");
  if (m) return Math.min(Number(m[1]), 24);
  return 8;
}

/** Builds a full day-by-day itinerary from the product's highlights and geography. */
export function buildItinerary(p: CatalogueProduct): ItineraryDay[] {
  const total = itineraryLength(p);
  const city = p.location.split(",")[0]?.trim() || p.country;
  const highlights = p.highlights.length ? p.highlights : [p.subtitle];
  const stayName = p.operator ? `${p.operator} selected property` : "Hand-picked luxury property";
  const days: ItineraryDay[] = [];

  for (let i = 1; i <= total; i++) {
    if (i === 1) {
      days.push({
        day: 1,
        title: `Arrive ${city}`,
        summary: `Private airport greeting and transfer on arrival in ${city}. Time to settle in before an evening welcome briefing with your Worldway host, who walks you through the days ahead.`,
        meals: "Dinner",
        stay: stayName,
      });
      continue;
    }
    if (i === total) {
      days.push({
        day: total,
        title: `Depart ${city}`,
        summary: `A final unhurried breakfast before your private transfer to the airport, with lounge access and fast-track assistance arranged by your concierge.`,
        meals: "Breakfast",
        stay: "—",
      });
      continue;
    }
    const h = highlights[(i - 2) % highlights.length];
    const variant = hash(`${p.slug}-${i}`) % 3;
    const summary =
      variant === 0
        ? `${h}. Guided privately at your own pace, with time built in for photography and a long lunch away from the crowds.`
        : variant === 1
          ? `${h}. Morning exploration with your specialist guide, the afternoon left free for the spa, the water or independent discovery.`
          : `${h}. A full immersive day with exclusive access arranged in advance, closing with dinner curated around the region's produce.`;
    days.push({
      day: i,
      title: h.length > 58 ? `${h.slice(0, 55)}…` : h,
      summary,
      meals: variant === 2 ? "Breakfast, lunch, dinner" : "Breakfast, lunch",
      stay: stayName,
    });
  }
  return days;
}

/** Next twelve months of departures filtered to the product's operating months. */
export function departureOptions(p: CatalogueProduct, count = 8): DepartureOption[] {
  const out: DepartureOption[] = [];
  const now = new Date();
  for (let m = 1; m <= 14 && out.length < count; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const monthName = MONTH_NAMES[base.getMonth()];
    if (p.departureMonths.length && !p.departureMonths.includes(monthName)) continue;
    for (const dayOfMonth of [8, 22]) {
      if (out.length >= count) break;
      const dt = new Date(base.getFullYear(), base.getMonth(), dayOfMonth);
      const key = hash(`${p.slug}-${dt.toISOString().slice(0, 10)}`);
      const seatsLeft = 2 + (key % 10);
      out.push({
        date: dt.toISOString().slice(0, 10),
        label: dt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
        seatsLeft,
        priceDelta: [0, 0, 5, -4, 8][key % 5],
        status: seatsLeft <= 4 ? "limited" : key % 3 === 0 ? "guaranteed" : "available",
      });
    }
  }
  return out;
}

export interface PriceBreakdown {
  perGuest: number;
  guests: number;
  subtotal: number;
  singleSupplement: number;
  taxes: number;
  total: number;
  depositDue: number;
  balanceDue: number;
  currency: string;
}

export function priceBreakdown(
  p: CatalogueProduct,
  guests: number,
  departure: DepartureOption | null,
  singleRoom = false,
): PriceBreakdown {
  const base = p.priceFrom ?? 0;
  const perGuest = Math.round(base * (1 + (departure?.priceDelta ?? 0) / 100));
  const subtotal = perGuest * guests;
  const singleSupplement = singleRoom ? Math.round(perGuest * 0.35) : 0;
  const taxes = Math.round((subtotal + singleSupplement) * 0.08);
  const total = subtotal + singleSupplement + taxes;
  const depositDue = Math.round(total * 0.25);
  return {
    perGuest,
    guests,
    subtotal,
    singleSupplement,
    taxes,
    total,
    depositDue,
    balanceDue: total - depositDue,
    currency: "USD",
  };
}

export const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    n,
  );