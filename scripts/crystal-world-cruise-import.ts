/**
 * Crystal World Cruise catalogue importer.
 *
 * The authorised AKTG Shopping API distributes Crystal's segment voyages only
 * (177 records, maximum 18 nights); the full World Cruise voyages are not part
 * of that entitlement — `/d/v1/products/cruises?voyageNumber=CSE-W139-270108`
 * returns an empty product list and `/d/v1/cruises/availability` returns a
 * supplier 500. This script therefore builds the World Cruise catalogue from
 * Crystal's own official voyage pages (permitted catalogue/content enrichment),
 * writing the extracted records to `src/lib/crystal/world-cruises.data.ts`.
 *
 * Nothing is invented: every field is copied from the official page payload.
 *
 * Usage: bun scripts/crystal-world-cruise-import.ts
 */

const SOURCES = [
  { year: 2027, slug: "none-cse-w139-270108" },
  { year: 2028, slug: "none-csy-w150-280111" },
  { year: 2029, slug: "none-csy-w127-290107" },
];

const CURRENCY = "USD";

interface RawPort {
  city?: string;
  country?: string;
  countryCode?: string;
  portCode?: string;
  description?: string;
}
interface RawDay {
  day?: string;
  pos?: number;
  itineraryDate?: string;
  arrivalTime?: string;
  departTime?: string;
  isOvernight?: string;
  dockAnchor?: string;
  dressCode?: string;
  port?: RawPort;
}
interface RawSuite {
  category?: string;
  categoryCode?: string;
  currency?: string;
  priceDouble?: number;
  priceSingle?: number;
  priceChild?: number;
  portCharge?: number;
  maxCapacity?: number;
  availability?: number;
}

function text(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "None" || s === "null" || s === "undefined" ? "" : s;
}

function stripHtml(v: unknown): string {
  return text(v)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(v: unknown): string {
  return text(v).slice(0, 10);
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

async function loadVoyage(slug: string) {
  const url = `https://www.crystalcruises.com/cruises/${slug}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (WorldwayCatalogueBot)" } });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) throw new Error(`${slug}: official payload not found`);
  const parsed = JSON.parse(match[1]) as {
    props?: { pageProps?: { result?: Record<string, unknown> } };
  };
  const r = parsed.props?.pageProps?.result;
  if (!r) throw new Error(`${slug}: no voyage record`);
  return { url, r };
}

function build(year: number, url: string, r: Record<string, unknown>) {
  const days = ((r.itineraries ?? []) as RawDay[])
    .slice()
    .sort((a, b) => Number(a.pos ?? a.day ?? 0) - Number(b.pos ?? b.day ?? 0))
    .map((d, i) => {
      const port = text(d.port?.city) || "At sea";
      const country = text(d.port?.country);
      return {
        day: Number(d.day ?? i + 1),
        date: isoDate(d.itineraryDate) || undefined,
        port,
        portCode: text(d.port?.portCode) || undefined,
        country: country && country !== "At sea" ? country : undefined,
        arrive: text(d.arrivalTime).slice(0, 5) || undefined,
        depart: text(d.departTime).slice(0, 5) || undefined,
        overnight: text(d.isOvernight) === "True" || undefined,
        dressCode: text(d.dressCode) || undefined,
      };
    });

  const suites = ((r.suites ?? []) as RawSuite[])
    .filter((s) => (s.currency ?? CURRENCY) === CURRENCY && num(s.priceDouble))
    .map((s) => ({
      category: text(s.category),
      categoryCode: text(s.categoryCode) || undefined,
      priceDouble: num(s.priceDouble)!,
      priceSingle: num(s.priceSingle),
      priceChild: num(s.priceChild),
      portCharge: num(s.portCharge),
      maxCapacity: num(s.maxCapacity),
      availability: Number(s.availability ?? 0) || 0,
    }));

  const usdPrices = ((r.price ?? []) as { currency?: string; priceSum?: number }[])
    .filter((p) => p.currency === CURRENCY)
    .map((p) => num(p.priceSum))
    .filter((n): n is number => Boolean(n));

  return {
    year,
    code: text(r.voyageNumber),
    voyageId: num(r.voyageID),
    title: text(r.title) || text(r.voyageName),
    voyageName: text(r.voyageName) || undefined,
    description: stripHtml(r.voyageDescription) || stripHtml(r.description) || undefined,
    ship: text(r.ship),
    shipCode: text((r.shipInfo as { shipCode?: string } | undefined)?.shipCode) || undefined,
    nights: Number(r.duration ?? 0) || days.length,
    embarkDate: isoDate(r.embarkDate),
    debarkDate: isoDate(r.debarkDate),
    embarkPort: text(r.embarkPort),
    debarkPort: text(r.debarkPort),
    countries: Number(r.countries ?? 0) || undefined,
    priceFrom: usdPrices.length ? Math.min(...usdPrices) : undefined,
    currency: CURRENCY,
    media: {
      hero: text(r.image1) || undefined,
      gallery: [text(r.image2)].filter(Boolean),
      mapSvg: text(r.mapSVG) || undefined,
      mapPng: text(r.mapPNG) || undefined,
      itineraryPdf: text(r.flyerPDF) || text(r.brochure) || undefined,
    },
    sourceUrl: url,
    itinerary: days,
    suites,
  };
}

const records = [];
for (const s of SOURCES) {
  const { url, r } = await loadVoyage(s.slug);
  const rec = build(s.year, url, r);
  if (!rec.code || !rec.embarkDate || rec.itinerary.length === 0) {
    throw new Error(`${s.slug}: incomplete official record — refusing to write partial data`);
  }
  console.log(
    `${rec.year} ${rec.code} · ${rec.ship} · ${rec.nights} nights · ${rec.itinerary.length} itinerary days · ${rec.suites.length} suite fares · from ${rec.priceFrom} ${rec.currency}`,
  );
  records.push(rec);
}

const header = `// GENERATED FILE — do not edit by hand.
// Source: Crystal Cruises official voyage pages (permitted catalogue enrichment).
// Regenerate with: bun scripts/crystal-world-cruise-import.ts
// Imported ${new Date().toISOString()}
import type { CrystalWorldCruiseRecord } from "./world-cruises";

export const CRYSTAL_WORLD_CRUISE_RECORDS: CrystalWorldCruiseRecord[] =
`;

await Bun.write(
  "src/lib/crystal/world-cruises.data.ts",
  `${header}${JSON.stringify(records, null, 2)};\n`,
);
console.log(`Wrote ${records.length} World Cruise records.`);
