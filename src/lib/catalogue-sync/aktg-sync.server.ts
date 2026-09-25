// AKTG (Abercrombie & Kent) full website synchronisation — SERVER ONLY.
//
// abercrombiekent.com is rendered from A&K's public content API (Sanity project
// bsiop5ln / dataset production). Every journey page, journey category,
// destination/collection listing and detail sub-page on the website reads from
// the same "journeys" documents, so querying that source covers the whole site
// with real, current data. Journeys are upserted by source ID + slug,
// deduplicated, and journeys no longer published are marked inactive. Worldway
// fields (worldway_overrides) are never touched by the sync.

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { journeys as staticJourneys } from "@/lib/all-journeys-content";
import type { Journey } from "@/lib/data";

const SANITY_QUERY_URL = "https://bsiop5ln.api.sanity.io/v2023-01-01/data/query/production";
const IMAGE_BASE = "https://cdn.sanity.io/images/bsiop5ln/production/";
const SITE = "https://www.abercrombiekent.com/journeys/";

const EXCLUDED_TYPES = [
  "Pre Tour Extension",
  "Post Tour Extension",
  "Post Tour Extension (Cruise)",
  "Tailormade Extension",
];

const GROQ = `*[_type=="journeys" && !(_id in path("drafts.**")) && defined(slug.current) && !(type in $excluded)]{
  _id, _updatedAt, code, title, type, subType, categories, groupSize, lengthDays, overviewText,
  "slug": slug.current,
  "heroImages": heroImages[].image.asset._ref,
  "mapImage": mapImage.asset._ref,
  "highlights": highlightItems[].description,
  "advantages": advantages[].description,
  "lowestUsd": lowestPrices[currency=="USD"][0].price,
  "dates": dates[]{travelStartDate, travelEndDate, availabilityOverride},
  "days": dayByDay[]{day, dayTitle, dayDescription, meals, "acc": accommodations[].accommodation->name},
  "geo": dayByDay[].cities[].cityID->city->country->{name, "continent": continent->name}
}`;

type SanityJourney = {
  _id: string;
  _updatedAt: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  subType?: string | null;
  categories?: string[] | null;
  groupSize?: number | null;
  lengthDays?: number | null;
  overviewText?: string | null;
  slug: string;
  heroImages?: (string | null)[] | null;
  mapImage?: string | null;
  highlights?: (string | null)[] | null;
  advantages?: (string | null)[] | null;
  lowestUsd?: string | null;
  dates?: { travelStartDate?: string; travelEndDate?: string; availabilityOverride?: string }[] | null;
  days?: {
    day?: number;
    dayTitle?: string;
    dayDescription?: string;
    meals?: string[];
    acc?: (string | null)[];
  }[] | null;
  geo?: ({ name?: string; continent?: string } | null)[] | null;
};

export interface SyncCounts {
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  failed: number;
}

function imageUrl(ref?: string | null): string | null {
  if (!ref) return null;
  const m = ref.match(/^image-([a-f0-9]+-\d+x\d+)-(\w+)$/);
  return m ? `${IMAGE_BASE}${m[1]}.${m[2]}?w=1600&fit=max&auto=format` : null;
}

function stripHtml(input?: string | null): string {
  return (input ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function categoryFor(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith("small group")) return "small-group-journeys";
  if (t.startsWith("ready-to-book")) return "private-ready-to-book";
  if (t.startsWith("expedition")) return "expedition-cruises";
  if (t.startsWith("canal")) return "canal-barge-cruises";
  if (t.includes("jet")) return "private-jet-journeys";
  if (t.startsWith("beach")) return "beach";
  return "tailor-made";
}

function regionFor(continent?: string): string {
  switch (continent) {
    case "Africa":
      return "africa";
    case "North Africa & Middle East":
      return "middle-east";
    case "North America":
    case "Caribbean":
    case "Central America":
      return "north-america";
    case "South America":
    case "Antarctica":
      return "south-america";
    case "Australia & New Zealand":
    case "South Pacific":
      return "oceania";
    case "Europe":
    case "Arctic":
      return "europe";
    default:
      return "asia";
  }
}

const clean = (list?: (string | null)[] | null) =>
  [...new Set((list ?? []).map((v) => (v ?? "").trim()).filter(Boolean))];

function toJourney(doc: SanityJourney): Journey & Record<string, unknown> {
  const slug = doc.slug.split("/").pop() || doc.slug;
  const type = doc.type ?? "Journey";
  const countries = clean((doc.geo ?? []).map((g) => g?.name ?? null));
  const continents = clean((doc.geo ?? []).map((g) => g?.continent ?? null));
  const images = clean((doc.heroImages ?? []).map(imageUrl));
  const today = new Date().toISOString().slice(0, 10);
  const future = (doc.dates ?? []).filter((d) => (d.travelStartDate ?? "") >= today);
  const departures = [
    ...new Set(
      future
        .map((d) => d.travelStartDate)
        .filter((d): d is string => Boolean(d))
        .sort()
        .map((d) =>
          new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
        ),
    ),
  ];
  const price = doc.lowestUsd ? Number(doc.lowestUsd) : NaN;
  const days = doc.days ?? [];
  return {
    slug,
    title: doc.title ?? slug,
    destination: countries[0] ?? continents[0] ?? "Worldwide",
    country: countries[0] ?? "",
    region: regionFor(continents[0]),
    category: categoryFor(type),
    style: clean([type, ...(doc.categories ?? [])]),
    duration: doc.lengthDays ?? days.length,
    priceFrom: Number.isFinite(price) && price > 0 ? price : null,
    availability: (future.length > 0 ? "Available" : "On Request") as Journey["availability"],
    departures,
    featured: false,
    image: images[0] ?? "",
    images,
    mapImage: imageUrl(doc.mapImage) ?? undefined,
    overview: stripHtml(doc.overviewText),
    highlights: clean(doc.highlights),
    itinerary: days.map((d) => ({
      day: `Day ${d.day ?? ""}`.trim(),
      title: d.dayTitle ?? "",
      text: [stripHtml(d.dayDescription), d.meals?.length ? `Meals: ${d.meals.map((m) => m[0]!.toUpperCase() + m.slice(1)).join(", ")}` : ""]
        .filter(Boolean)
        .join("\n"),
    })),
    inclusions: clean(doc.advantages),
    exclusions: [],
    accommodations: clean(days.flatMap((d) => d.acc ?? [])),
    faqs: [],
    countries,
    groupSize: doc.groupSize ?? undefined,
    journeyType: type,
    sourceCategories: clean(doc.categories),
    sourceId: doc._id,
    sourceCode: doc.code ?? undefined,
    sourceSlug: doc.slug,
    sourceUrl: `${SITE}${doc.slug}`,
    sourceUpdatedAt: doc._updatedAt,
  };
}

function cardOf(j: Journey): Partial<Journey> {
  const { itinerary: _i, inclusions: _in, exclusions: _e, accommodations: _a, faqs: _f, ...rest } = j;
  return { ...rest, overview: j.overview.slice(0, 600), itinerary: [], inclusions: [], exclusions: [], accommodations: [], faqs: [] };
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function fetchAllJourneys(): Promise<SanityJourney[]> {
  const url = new URL(SANITY_QUERY_URL);
  url.searchParams.set("query", GROQ);
  url.searchParams.set("$excluded", JSON.stringify(EXCLUDED_TYPES));
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) throw new Error(`A&K content source returned HTTP ${res.status}`);
      const body = (await res.json()) as { result?: SanityJourney[] };
      if (!Array.isArray(body.result)) throw new Error("A&K content source returned no journey list");
      return body.result;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("A&K content source unreachable");
}

export async function runAktgFullSync(db: SupabaseClient, sessionId: string): Promise<SyncCounts> {
  const counts: SyncCounts = { discovered: 0, created: 0, updated: 0, unchanged: 0, deactivated: 0, failed: 0 };
  const failures: { slug: string; reason: string }[] = [];
  const docs = await fetchAllJourneys();

  // Deduplicate: one record per public slug, newest source update wins.
  const bySlug = new Map<string, Journey & Record<string, unknown>>();
  for (const doc of docs) {
    try {
      const j = toJourney(doc);
      if (!j.slug || j.slug === "undefined") continue;
      const prev = bySlug.get(j.slug);
      if (!prev || String(j["sourceUpdatedAt"]) > String(prev["sourceUpdatedAt"])) bySlug.set(j.slug, j);
    } catch (error) {
      counts.failed += 1;
      failures.push({ slug: doc.slug, reason: error instanceof Error ? error.message : "map failed" });
    }
  }
  counts.discovered = bySlug.size;

  const { data: existing, error } = await db
    .from("aktg_journeys")
    .select("slug, source_id, content_hash, is_active");
  if (error) throw new Error(`Could not read stored journeys: ${error.message}`);
  const known = new Map((existing ?? []).map((r) => [r.slug as string, r]));

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const j of bySlug.values()) {
    const contentHash = hash(j);
    const prev = known.get(j.slug);
    const base = {
      source_id: String(j["sourceId"]),
      slug: j.slug,
      code: (j["sourceCode"] as string | null) ?? null,
      title: j.title,
      journey_type: (j["journeyType"] as string) ?? null,
      source_url: String(j["sourceUrl"]),
      source_updated_at: String(j["sourceUpdatedAt"]),
      last_seen_at: now,
      is_active: true,
      deactivated_at: null,
    };
    if (!prev) {
      counts.created += 1;
      rows.push({ ...base, card: cardOf(j), data: j, content_hash: contentHash });
    } else if (prev.content_hash !== contentHash || !prev.is_active) {
      counts.updated += 1;
      rows.push({ ...base, card: cardOf(j), data: j, content_hash: contentHash });
    } else {
      counts.unchanged += 1;
    }
  }

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error: writeError } = await db.from("aktg_journeys").upsert(chunk as never, { onConflict: "slug" });
    if (writeError) {
      // Retry row by row so one bad record doesn't fail the chunk.
      for (const row of chunk) {
        const { error: rowError } = await db.from("aktg_journeys").upsert(row as never, { onConflict: "slug" });
        if (rowError) {
          counts.failed += 1;
          failures.push({ slug: String(row["slug"]), reason: rowError.message });
          if (known.has(String(row["slug"]))) counts.updated -= 1;
          else counts.created -= 1;
        }
      }
    }
  }

  // Deactivate stored journeys A&K no longer publishes.
  const gone = (existing ?? []).filter((r) => r.is_active && !bySlug.has(r.slug as string)).map((r) => r.slug as string);
  // Static catalogue A&K journeys (carrying an A&K source ID) that were removed upstream get an inactive record.
  const tombstones = staticJourneys
    .filter((j) => {
      const sid = (j as unknown as Record<string, unknown>)["sourceId"];
      return typeof sid === "string" && sid.startsWith("journeys-") && !bySlug.has(j.slug) && !known.has(j.slug);
    })
    .map((j) => ({
      source_id: String((j as unknown as Record<string, unknown>)["sourceId"]),
      slug: j.slug,
      title: j.title,
      card: cardOf(j),
      data: j,
      is_active: false,
      deactivated_at: now,
    }));
  for (let i = 0; i < gone.length; i += 100) {
    const { error: deErr } = await db
      .from("aktg_journeys")
      .update({ is_active: false, deactivated_at: now } as never)
      .in("slug", gone.slice(i, i + 100));
    if (!deErr) counts.deactivated += gone.slice(i, i + 100).length;
  }
  if (tombstones.length) {
    const { error: tErr } = await db.from("aktg_journeys").upsert(tombstones as never, { onConflict: "slug" });
    if (!tErr) counts.deactivated += tombstones.length;
  }

  await db
    .from("catalogue_sync_sessions")
    .update({ ...counts, detail: { failures: failures.slice(0, 50), source: "abercrombiekent.com content API" } } as never)
    .eq("id", sessionId);
  return counts;
}
