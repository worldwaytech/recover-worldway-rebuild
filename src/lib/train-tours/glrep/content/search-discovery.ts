/**
 * GLREP Journey Content Domain — Phase 3 Search & Discovery Engine.
 *
 * Completely additive, registry-driven, presentation-free, SSR-safe and
 * deterministic. Composes the existing {@link ContentRegistries} into search
 * indexes, full-text/faceted search, autocomplete, sorting, recommendations,
 * popular-search surfaces and a persistence-free analytics model.
 *
 * No existing booking / pricing / comparison / journey / operator / train /
 * destination / routing / registry / content module is modified. All business
 * logic is composed, never duplicated.
 *
 * @module glrep/content/search-discovery
 */

import type { CabinRecord, DestinationRecord, OperatorRecord, TrainRecord } from "./model";
import type { ContentRegistries, JourneyRecord } from "./registries";

/* ==========================================================================
 * 0. Shared primitives
 * ======================================================================== */

export type EntityKind = "journey" | "operator" | "train" | "destination";

/** A normalized, index-ready document for any entity kind. */
export interface SearchDocument {
  readonly id: string;
  readonly slug: string;
  readonly kind: EntityKind;
  readonly title: string;
  readonly subtitle: string;
  /** Pre-tokenized, lowercased searchable terms with field weights. */
  readonly fields: readonly WeightedField[];
  /** Flattened lowercase haystack for prefix / fuzzy scans. */
  readonly haystack: string;
}

export interface WeightedField {
  readonly text: string;
  readonly weight: number;
}

const lc = (s: string): string => s.toLowerCase();

const normalizeQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, " ");

const tokenize = (s: string): readonly string[] =>
  normalizeQuery(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);

/** Deterministic ascending comparison by a string key. */
const byKey =
  <T>(key: (t: T) => string) =>
  (a: T, b: T): number =>
    key(a).localeCompare(key(b), "en");

/** Levenshtein distance — bounded, deterministic, allocation-light. */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/* ==========================================================================
 * 1. Search Index Engine
 * ======================================================================== */

const fieldsToDoc = (
  id: string,
  slug: string,
  kind: EntityKind,
  title: string,
  subtitle: string,
  fields: readonly WeightedField[],
): SearchDocument => ({
  id,
  slug,
  kind,
  title,
  subtitle,
  fields: fields.map((f) => ({ text: lc(f.text), weight: f.weight })),
  haystack: lc(fields.map((f) => f.text).join(" ")),
});

const journeyDoc = (r: ContentRegistries, j: JourneyRecord): SearchDocument => {
  const destNames = j.destinationIds
    .map((id) => r.destinations.get(id))
    .filter((d) => d.ok)
    .map((d) => (d.ok ? d.value.name : ""));
  return fieldsToDoc(j.id, j.slug, "journey", j.name, j.overview.summary, [
    { text: j.name, weight: 6 },
    { text: j.overview.summary, weight: 2 },
    { text: j.overview.fromCity, weight: 2 },
    { text: j.overview.toCity, weight: 2 },
    { text: j.seo.keywords.join(" "), weight: 3 },
    { text: destNames.join(" "), weight: 2 },
    { text: j.highlights.map((h) => h.title).join(" "), weight: 1 },
  ]);
};

const operatorDoc = (o: OperatorRecord): SearchDocument =>
  fieldsToDoc(o.id, o.slug, "operator", o.name, o.description, [
    { text: o.name, weight: 6 },
    { text: o.description, weight: 2 },
    { text: o.headquarters ?? "", weight: 1 },
  ]);

const trainDoc = (t: TrainRecord): SearchDocument =>
  fieldsToDoc(t.id, t.slug, "train", t.name, t.description, [
    { text: t.name, weight: 6 },
    { text: t.description, weight: 2 },
    { text: t.history ?? "", weight: 1 },
    { text: t.technicalSpecs.map((s) => `${s.label} ${s.value}`).join(" "), weight: 1 },
  ]);

const destinationDoc = (d: DestinationRecord): SearchDocument =>
  fieldsToDoc(d.id, d.slug, "destination", d.name, d.description, [
    { text: d.name, weight: 6 },
    { text: d.country, weight: 4 },
    { text: d.description, weight: 2 },
    { text: d.guide ?? "", weight: 1 },
  ]);

const sortDocs = (docs: readonly SearchDocument[]): SearchDocument[] =>
  [...docs].sort(byKey((d) => `${d.kind}:${d.id}`));

export const buildJourneyIndex = (r: ContentRegistries): readonly SearchDocument[] =>
  sortDocs(r.journeys.all.map((j) => journeyDoc(r, j)));

export const buildOperatorIndex = (r: ContentRegistries): readonly SearchDocument[] =>
  sortDocs(r.operators.all.map(operatorDoc));

export const buildTrainIndex = (r: ContentRegistries): readonly SearchDocument[] =>
  sortDocs(r.trains.all.map(trainDoc));

export const buildDestinationIndex = (r: ContentRegistries): readonly SearchDocument[] =>
  sortDocs(r.destinations.all.map(destinationDoc));

export interface GlobalSearchIndex {
  readonly documents: readonly SearchDocument[];
  readonly byKind: Readonly<Record<EntityKind, readonly SearchDocument[]>>;
  readonly size: number;
  readonly builtAt: string;
}

export const buildGlobalSearchIndex = (
  r: ContentRegistries,
  builtAt = "1970-01-01T00:00:00.000Z",
): GlobalSearchIndex => {
  const journeys = buildJourneyIndex(r);
  const operators = buildOperatorIndex(r);
  const trains = buildTrainIndex(r);
  const destinations = buildDestinationIndex(r);
  const documents = sortDocs([...journeys, ...operators, ...trains, ...destinations]);
  return {
    documents,
    byKind: { journey: journeys, operator: operators, train: trains, destination: destinations },
    size: documents.length,
    builtAt,
  };
};

/**
 * Incremental indexing — merge new/updated documents into an existing index by
 * `kind:id`, preserving determinism. Returns a fresh, immutable index.
 */
export const mergeIntoIndex = (
  index: GlobalSearchIndex,
  updates: readonly SearchDocument[],
  builtAt = index.builtAt,
): GlobalSearchIndex => {
  const map = new Map<string, SearchDocument>();
  for (const d of index.documents) map.set(`${d.kind}:${d.id}`, d);
  for (const d of updates) map.set(`${d.kind}:${d.id}`, d);
  const documents = sortDocs([...map.values()]);
  const byKind = {
    journey: documents.filter((d) => d.kind === "journey"),
    operator: documents.filter((d) => d.kind === "operator"),
    train: documents.filter((d) => d.kind === "train"),
    destination: documents.filter((d) => d.kind === "destination"),
  } as const;
  return { documents, byKind, size: documents.length, builtAt };
};

/* ==========================================================================
 * 2. Search Engine
 * ======================================================================== */

export type MatchType = "exact" | "prefix" | "fuzzy";

export interface SearchHit {
  readonly document: SearchDocument;
  readonly score: number;
  readonly matchType: MatchType;
  readonly matchedTerms: readonly string[];
}

export interface SearchOptions {
  readonly fuzzy?: boolean;
  /** Max edit distance for fuzzy matches (default 1). */
  readonly maxDistance?: number;
  readonly limit?: number;
}

const scoreDocument = (
  doc: SearchDocument,
  terms: readonly string[],
  opts: Required<Pick<SearchOptions, "fuzzy" | "maxDistance">>,
): { score: number; matchType: MatchType; matchedTerms: string[] } | null => {
  let score = 0;
  let best: MatchType | null = null;
  const matchedTerms: string[] = [];
  const rank: Record<MatchType, number> = { exact: 3, prefix: 2, fuzzy: 1 };
  const promote = (m: MatchType): void => {
    if (best === null || rank[m] > rank[best]) best = m;
  };

  for (const term of terms) {
    let termMatched = false;
    for (const field of doc.fields) {
      const tokens = field.text.split(/[^a-z0-9]+/i).filter(Boolean);
      for (const tok of tokens) {
        if (tok === term) {
          score += field.weight * 3;
          promote("exact");
          termMatched = true;
        } else if (tok.startsWith(term)) {
          score += field.weight * 2;
          promote("prefix");
          termMatched = true;
        } else if (opts.fuzzy && term.length >= 3) {
          const dist = levenshtein(tok, term);
          if (dist <= opts.maxDistance) {
            score += field.weight * Math.max(1, 2 - dist);
            promote("fuzzy");
            termMatched = true;
          }
        }
      }
    }
    if (termMatched) matchedTerms.push(term);
  }

  if (best === null || matchedTerms.length === 0) return null;
  return { score, matchType: best, matchedTerms };
};

const runSearch = (
  docs: readonly SearchDocument[],
  rawQuery: string,
  options: SearchOptions = {},
): readonly SearchHit[] => {
  const terms = tokenize(rawQuery);
  if (terms.length === 0) return [];
  const cfg = { fuzzy: options.fuzzy ?? true, maxDistance: options.maxDistance ?? 1 };
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const scored = scoreDocument(doc, terms, cfg);
    if (scored) {
      hits.push({
        document: doc,
        score: scored.score,
        matchType: scored.matchType,
        matchedTerms: scored.matchedTerms,
      });
    }
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return `${a.document.kind}:${a.document.id}`.localeCompare(
      `${b.document.kind}:${b.document.id}`,
      "en",
    );
  });
  return options.limit != null ? hits.slice(0, options.limit) : hits;
};

export const searchAll = (
  index: GlobalSearchIndex,
  query: string,
  options?: SearchOptions,
): readonly SearchHit[] => runSearch(index.documents, query, options);

export const searchJourneys = (
  index: GlobalSearchIndex,
  query: string,
  options?: SearchOptions,
): readonly SearchHit[] => runSearch(index.byKind.journey, query, options);

export const searchOperators = (
  index: GlobalSearchIndex,
  query: string,
  options?: SearchOptions,
): readonly SearchHit[] => runSearch(index.byKind.operator, query, options);

export const searchTrains = (
  index: GlobalSearchIndex,
  query: string,
  options?: SearchOptions,
): readonly SearchHit[] => runSearch(index.byKind.train, query, options);

export const searchDestinations = (
  index: GlobalSearchIndex,
  query: string,
  options?: SearchOptions,
): readonly SearchHit[] => runSearch(index.byKind.destination, query, options);

/* ==========================================================================
 * 3. Autocomplete Engine
 * ======================================================================== */

export interface AutocompleteSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

export interface AutocompleteSuggestion {
  readonly id: string;
  readonly slug: string;
  readonly kind: EntityKind;
  readonly label: string;
  readonly segments: readonly AutocompleteSegment[];
  readonly score: number;
  /** Stable index for keyboard navigation. */
  readonly position: number;
}

export interface AutocompleteGroup {
  readonly kind: EntityKind;
  readonly suggestions: readonly AutocompleteSuggestion[];
}

export interface AutocompleteResult {
  readonly query: string;
  readonly groups: readonly AutocompleteGroup[];
  readonly flat: readonly AutocompleteSuggestion[];
  readonly total: number;
}

const highlightSegments = (label: string, query: string): readonly AutocompleteSegment[] => {
  const q = normalizeQuery(query);
  if (!q) return [{ text: label, highlighted: false }];
  const idx = lc(label).indexOf(q);
  if (idx < 0) return [{ text: label, highlighted: false }];
  const segs: AutocompleteSegment[] = [];
  if (idx > 0) segs.push({ text: label.slice(0, idx), highlighted: false });
  segs.push({ text: label.slice(idx, idx + q.length), highlighted: true });
  if (idx + q.length < label.length)
    segs.push({ text: label.slice(idx + q.length), highlighted: false });
  return segs;
};

export interface AutocompleteOptions extends SearchOptions {
  /** Max suggestions per group (default 5). */
  readonly perGroup?: number;
}

const KIND_ORDER: readonly EntityKind[] = ["journey", "destination", "operator", "train"];

export const autocomplete = (
  index: GlobalSearchIndex,
  query: string,
  options: AutocompleteOptions = {},
): AutocompleteResult => {
  const perGroup = options.perGroup ?? 5;
  const hits = runSearch(index.documents, query, { ...options, limit: undefined });
  const grouped = new Map<EntityKind, SearchHit[]>();
  for (const h of hits) {
    const list = grouped.get(h.document.kind) ?? [];
    if (list.length < perGroup) list.push(h);
    grouped.set(h.document.kind, list);
  }
  let position = 0;
  const flat: AutocompleteSuggestion[] = [];
  const groups: AutocompleteGroup[] = [];
  for (const kind of KIND_ORDER) {
    const list = grouped.get(kind);
    if (!list || list.length === 0) continue;
    const suggestions = list.map((h) => {
      const s: AutocompleteSuggestion = {
        id: h.document.id,
        slug: h.document.slug,
        kind,
        label: h.document.title,
        segments: highlightSegments(h.document.title, query),
        score: h.score,
        position: position++,
      };
      flat.push(s);
      return s;
    });
    groups.push({ kind, suggestions });
  }
  return { query: normalizeQuery(query), groups, flat, total: flat.length };
};

/* ==========================================================================
 * 4. Faceted Filtering Engine
 * ======================================================================== */

export type PriceBand = "entry" | "premium" | "ultra";
export type LuxuryLevel = "classic" | "luxury" | "ultra-luxury";

/** A journey enriched with derived facet values (registry-driven, no new data). */
export interface JourneyFacetRecord {
  readonly journey: JourneyRecord;
  readonly operatorId: string;
  readonly trainId: string;
  readonly destinationIds: readonly string[];
  readonly countries: readonly string[];
  readonly seasons: readonly string[];
  readonly durationDays: number;
  readonly cabinClasses: readonly CabinRecord["cabinClass"][];
  readonly experiences: readonly string[];
  readonly departureCount: number;
  readonly departureMonths: readonly string[];
  readonly luxuryLevel: LuxuryLevel;
  readonly priceBand: PriceBand;
}

const CABIN_RANK: Record<CabinRecord["cabinClass"], number> = {
  heritage: 0,
  deluxe: 1,
  suite: 2,
  "grand-suite": 3,
  "royal-suite": 4,
};

const deriveLuxuryLevel = (classes: readonly CabinRecord["cabinClass"][]): LuxuryLevel => {
  const top = classes.reduce((m, c) => Math.max(m, CABIN_RANK[c]), 0);
  if (top >= 3) return "ultra-luxury";
  if (top >= 1) return "luxury";
  return "classic";
};

const derivePriceBand = (level: LuxuryLevel, durationDays: number): PriceBand => {
  if (level === "ultra-luxury" || durationDays >= 10) return "ultra";
  if (level === "luxury" || durationDays >= 5) return "premium";
  return "entry";
};

const monthOf = (iso: string): string => (iso.length >= 7 ? iso.slice(0, 7) : "");

export const buildJourneyFacetRecord = (
  r: ContentRegistries,
  j: JourneyRecord,
): JourneyFacetRecord => {
  const countries = Array.from(
    new Set(
      j.destinationIds
        .map((id) => r.destinations.get(id))
        .filter((d) => d.ok)
        .map((d) => (d.ok ? d.value.country : "")),
    ),
  )
    .filter(Boolean)
    .sort(byKey((s) => s));
  const cabinClasses = Array.from(
    new Set(
      j.cabinIds
        .map((id) => r.cabins.get(id))
        .filter((c) => c.ok)
        .map((c) => (c.ok ? c.value.cabinClass : "heritage")),
    ),
  ).sort((a, b) => CABIN_RANK[a] - CABIN_RANK[b]);
  const level = deriveLuxuryLevel(cabinClasses);
  const departureMonths = Array.from(
    new Set(
      [j.departureCalendar.firstDeparture, j.departureCalendar.lastDeparture]
        .map(monthOf)
        .filter(Boolean),
    ),
  ).sort();
  return {
    journey: j,
    operatorId: j.operatorId,
    trainId: j.trainId,
    destinationIds: [...j.destinationIds].sort(),
    countries,
    seasons: [...j.practical.travelSeasons].map(lc).sort(),
    durationDays: j.overview.durationDays,
    cabinClasses,
    experiences: [...j.includedServices, ...j.optionalExperiences].map(lc).sort(),
    departureCount: j.departureCalendar.departureCount,
    departureMonths,
    luxuryLevel: level,
    priceBand: derivePriceBand(level, j.overview.durationDays),
  };
};

export const buildJourneyFacetRecords = (r: ContentRegistries): readonly JourneyFacetRecord[] =>
  r.journeys.all.map((j) => buildJourneyFacetRecord(r, j)).sort(byKey((f) => f.journey.id));

export interface FacetFilters {
  readonly operator?: string;
  readonly train?: string;
  readonly destination?: string;
  readonly country?: string;
  readonly season?: string;
  readonly minDuration?: number;
  readonly maxDuration?: number;
  readonly cabin?: CabinRecord["cabinClass"];
  readonly priceBand?: PriceBand;
  readonly experience?: string;
  /** Require at least one future departure (departureCount > 0). */
  readonly availableOnly?: boolean;
  readonly departureMonth?: string;
  readonly luxuryLevel?: LuxuryLevel;
}

const matchesFilters = (f: JourneyFacetRecord, q: FacetFilters): boolean => {
  if (q.operator && f.operatorId !== q.operator) return false;
  if (q.train && f.trainId !== q.train) return false;
  if (q.destination && !f.destinationIds.includes(q.destination)) return false;
  if (q.country && !f.countries.includes(q.country)) return false;
  if (q.season && !f.seasons.includes(lc(q.season))) return false;
  if (q.minDuration != null && f.durationDays < q.minDuration) return false;
  if (q.maxDuration != null && f.durationDays > q.maxDuration) return false;
  if (q.cabin && !f.cabinClasses.includes(q.cabin)) return false;
  if (q.priceBand && f.priceBand !== q.priceBand) return false;
  if (q.experience && !f.experiences.includes(lc(q.experience))) return false;
  if (q.availableOnly && f.departureCount <= 0) return false;
  if (q.departureMonth && !f.departureMonths.includes(q.departureMonth)) return false;
  if (q.luxuryLevel && f.luxuryLevel !== q.luxuryLevel) return false;
  return true;
};

export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

export interface FacetCounts {
  readonly operator: readonly FacetCount[];
  readonly train: readonly FacetCount[];
  readonly country: readonly FacetCount[];
  readonly season: readonly FacetCount[];
  readonly cabin: readonly FacetCount[];
  readonly priceBand: readonly FacetCount[];
  readonly experience: readonly FacetCount[];
  readonly departureMonth: readonly FacetCount[];
  readonly luxuryLevel: readonly FacetCount[];
}

const countValues = (values: readonly string[]): readonly FacetCount[] => {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.value.localeCompare(b.value, "en"),
    );
};

export const computeFacetCounts = (records: readonly JourneyFacetRecord[]): FacetCounts => ({
  operator: countValues(records.map((r) => r.operatorId)),
  train: countValues(records.map((r) => r.trainId)),
  country: countValues(records.flatMap((r) => r.countries)),
  season: countValues(records.flatMap((r) => r.seasons)),
  cabin: countValues(records.flatMap((r) => r.cabinClasses)),
  priceBand: countValues(records.map((r) => r.priceBand)),
  experience: countValues(records.flatMap((r) => r.experiences)),
  departureMonth: countValues(records.flatMap((r) => r.departureMonths)),
  luxuryLevel: countValues(records.map((r) => r.luxuryLevel)),
});

export interface FacetedResult {
  readonly records: readonly JourneyFacetRecord[];
  readonly counts: FacetCounts;
  readonly total: number;
}

export const applyFacets = (
  records: readonly JourneyFacetRecord[],
  filters: FacetFilters,
): FacetedResult => {
  const matched = records.filter((r) => matchesFilters(r, filters));
  return { records: matched, counts: computeFacetCounts(matched), total: matched.length };
};

/* ==========================================================================
 * 5. Sorting Engine
 * ======================================================================== */

export type SortKey =
  | "relevance"
  | "price"
  | "duration"
  | "popularity"
  | "departure"
  | "alphabetical"
  | "featured";

export interface SortContext {
  /** Relevance score by journey id (from a prior search), optional. */
  readonly relevance?: ReadonlyMap<string, number>;
  /** Featured journey ids, in priority order, optional. */
  readonly featured?: readonly string[];
}

const PRICE_RANK: Record<PriceBand, number> = { entry: 0, premium: 1, ultra: 2 };

export const sortJourneyFacets = (
  records: readonly JourneyFacetRecord[],
  key: SortKey,
  ctx: SortContext = {},
): readonly JourneyFacetRecord[] => {
  const featuredRank = new Map<string, number>((ctx.featured ?? []).map((id, i) => [id, i]));
  const tieBreak = byKey<JourneyFacetRecord>((r) => r.journey.id);
  const arr = [...records];
  switch (key) {
    case "price":
      return arr.sort(
        (a, b) => PRICE_RANK[a.priceBand] - PRICE_RANK[b.priceBand] || tieBreak(a, b),
      );
    case "duration":
      return arr.sort((a, b) => a.durationDays - b.durationDays || tieBreak(a, b));
    case "popularity":
      return arr.sort((a, b) => b.departureCount - a.departureCount || tieBreak(a, b));
    case "departure":
      return arr.sort(
        (a, b) =>
          a.journey.departureCalendar.firstDeparture.localeCompare(
            b.journey.departureCalendar.firstDeparture,
            "en",
          ) || tieBreak(a, b),
      );
    case "alphabetical":
      return arr.sort(
        (a, b) => a.journey.name.localeCompare(b.journey.name, "en") || tieBreak(a, b),
      );
    case "featured":
      return arr.sort((a, b) => {
        const ra = featuredRank.get(a.journey.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = featuredRank.get(b.journey.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb || tieBreak(a, b);
      });
    case "relevance":
    default:
      return arr.sort((a, b) => {
        const ra = ctx.relevance?.get(a.journey.id) ?? 0;
        const rb = ctx.relevance?.get(b.journey.id) ?? 0;
        return rb - ra || tieBreak(a, b);
      });
  }
};

/* ==========================================================================
 * 6. Recommendation Engine
 * ======================================================================== */

export interface RecommendationWeights {
  readonly sharedDestination: number;
  readonly sharedCountry: number;
  readonly sharedOperator: number;
  readonly sharedTrain: number;
  readonly sharedSeason: number;
  readonly sharedExperience: number;
  readonly sameLuxuryLevel: number;
  readonly samePriceBand: number;
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  sharedDestination: 4,
  sharedCountry: 2,
  sharedOperator: 3,
  sharedTrain: 3,
  sharedSeason: 1,
  sharedExperience: 1,
  sameLuxuryLevel: 2,
  samePriceBand: 1,
};

export interface Recommendation {
  readonly journeyId: string;
  readonly slug: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

const overlapCount = (a: readonly string[], b: readonly string[]): number => {
  const set = new Set(a);
  let n = 0;
  for (const x of b) if (set.has(x)) n++;
  return n;
};

export const recommendSimilarJourneys = (
  records: readonly JourneyFacetRecord[],
  sourceJourneyId: string,
  weights: RecommendationWeights = DEFAULT_RECOMMENDATION_WEIGHTS,
  limit = 6,
): readonly Recommendation[] => {
  const source = records.find((r) => r.journey.id === sourceJourneyId);
  if (!source) return [];
  const recs: Recommendation[] = [];
  for (const r of records) {
    if (r.journey.id === sourceJourneyId) continue;
    let score = 0;
    const reasons: string[] = [];
    const dest = overlapCount(source.destinationIds, r.destinationIds);
    if (dest > 0) {
      score += dest * weights.sharedDestination;
      reasons.push("sharedDestination");
    }
    const ctry = overlapCount(source.countries, r.countries);
    if (ctry > 0) {
      score += ctry * weights.sharedCountry;
      reasons.push("sharedCountry");
    }
    if (r.operatorId === source.operatorId) {
      score += weights.sharedOperator;
      reasons.push("sharedOperator");
    }
    if (r.trainId === source.trainId) {
      score += weights.sharedTrain;
      reasons.push("sharedTrain");
    }
    const season = overlapCount(source.seasons, r.seasons);
    if (season > 0) {
      score += season * weights.sharedSeason;
      reasons.push("sharedSeason");
    }
    const exp = overlapCount(source.experiences, r.experiences);
    if (exp > 0) {
      score += exp * weights.sharedExperience;
      reasons.push("sharedExperience");
    }
    if (r.luxuryLevel === source.luxuryLevel) {
      score += weights.sameLuxuryLevel;
      reasons.push("sameLuxuryLevel");
    }
    if (r.priceBand === source.priceBand) {
      score += weights.samePriceBand;
      reasons.push("samePriceBand");
    }
    if (score > 0) {
      recs.push({
        journeyId: r.journey.id,
        slug: r.journey.slug,
        name: r.journey.name,
        score,
        reasons,
      });
    }
  }
  recs.sort((a, b) => b.score - a.score || a.journeyId.localeCompare(b.journeyId, "en"));
  return recs.slice(0, limit);
};

export const recommendAlternativeDepartures = (
  records: readonly JourneyFacetRecord[],
  sourceJourneyId: string,
  limit = 6,
): readonly Recommendation[] => {
  const source = records.find((r) => r.journey.id === sourceJourneyId);
  if (!source) return [];
  const recs: Recommendation[] = [];
  for (const r of records) {
    if (r.journey.id === sourceJourneyId) continue;
    if (r.operatorId !== source.operatorId && r.trainId !== source.trainId) continue;
    const months = overlapCount(source.departureMonths, r.departureMonths);
    const score =
      (r.operatorId === source.operatorId ? 2 : 0) +
      (r.trainId === source.trainId ? 2 : 0) +
      months;
    recs.push({
      journeyId: r.journey.id,
      slug: r.journey.slug,
      name: r.journey.name,
      score,
      reasons: ["alternativeDeparture"],
    });
  }
  recs.sort((a, b) => b.score - a.score || a.journeyId.localeCompare(b.journeyId, "en"));
  return recs.slice(0, limit);
};

export interface DestinationRecommendation {
  readonly destinationId: string;
  readonly slug: string;
  readonly name: string;
  readonly score: number;
}

export const recommendNearbyDestinations = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  sourceJourneyId: string,
  limit = 6,
): readonly DestinationRecommendation[] => {
  const source = records.find((f) => f.journey.id === sourceJourneyId);
  if (!source) return [];
  const sourceSet = new Set(source.destinationIds);
  const counts = new Map<string, number>();
  for (const f of records) {
    if (f.journey.id === sourceJourneyId) continue;
    if (overlapCount(source.countries, f.countries) === 0) continue;
    for (const id of f.destinationIds) {
      if (sourceSet.has(id)) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const recs: DestinationRecommendation[] = [];
  for (const [id, score] of counts) {
    const d = r.destinations.get(id);
    if (!d.ok) continue;
    recs.push({ destinationId: id, slug: d.value.slug, name: d.value.name, score });
  }
  recs.sort((a, b) => b.score - a.score || a.destinationId.localeCompare(b.destinationId, "en"));
  return recs.slice(0, limit);
};

export interface EntityMatch {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly journeyCount: number;
}

export const matchingOperators = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  country: string,
  limit = 6,
): readonly EntityMatch[] => {
  const counts = new Map<string, number>();
  for (const f of records) {
    if (!f.countries.includes(country)) continue;
    counts.set(f.operatorId, (counts.get(f.operatorId) ?? 0) + 1);
  }
  const out: EntityMatch[] = [];
  for (const [id, journeyCount] of counts) {
    const o = r.operators.get(id);
    if (!o.ok) continue;
    out.push({ id, slug: o.value.slug, name: o.value.name, journeyCount });
  }
  out.sort((a, b) => b.journeyCount - a.journeyCount || a.id.localeCompare(b.id, "en"));
  return out.slice(0, limit);
};

export const matchingTrains = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  country: string,
  limit = 6,
): readonly EntityMatch[] => {
  const counts = new Map<string, number>();
  for (const f of records) {
    if (!f.countries.includes(country)) continue;
    counts.set(f.trainId, (counts.get(f.trainId) ?? 0) + 1);
  }
  const out: EntityMatch[] = [];
  for (const [id, journeyCount] of counts) {
    const t = r.trains.get(id);
    if (!t.ok) continue;
    out.push({ id, slug: t.value.slug, name: t.value.name, journeyCount });
  }
  out.sort((a, b) => b.journeyCount - a.journeyCount || a.id.localeCompare(b.id, "en"));
  return out.slice(0, limit);
};

export interface CrossSellOpportunity {
  readonly journeyId: string;
  readonly slug: string;
  readonly name: string;
  readonly score: number;
  readonly rationale: string;
}

/**
 * Cross-selling: complementary journeys (different operator) that visit nearby
 * countries, ranked by upgrade potential (higher price band) and overlap.
 */
export const crossSellOpportunities = (
  records: readonly JourneyFacetRecord[],
  sourceJourneyId: string,
  limit = 6,
): readonly CrossSellOpportunity[] => {
  const source = records.find((r) => r.journey.id === sourceJourneyId);
  if (!source) return [];
  const out: CrossSellOpportunity[] = [];
  for (const r of records) {
    if (r.journey.id === sourceJourneyId) continue;
    if (r.operatorId === source.operatorId) continue;
    const ctry = overlapCount(source.countries, r.countries);
    if (ctry === 0) continue;
    const upgrade = PRICE_RANK[r.priceBand] > PRICE_RANK[source.priceBand] ? 2 : 0;
    out.push({
      journeyId: r.journey.id,
      slug: r.journey.slug,
      name: r.journey.name,
      score: ctry * 2 + upgrade,
      rationale: upgrade > 0 ? "upgrade" : "complementary",
    });
  }
  out.sort((a, b) => b.score - a.score || a.journeyId.localeCompare(b.journeyId, "en"));
  return out.slice(0, limit);
};

/* ==========================================================================
 * 7. Popular Searches Engine
 * ======================================================================== */

export interface PopularConfig {
  readonly trendingWeightDepartures: number;
  readonly trendingWeightDuration: number;
  readonly limit: number;
}

export const DEFAULT_POPULAR_CONFIG: PopularConfig = {
  trendingWeightDepartures: 2,
  trendingWeightDuration: 1,
  limit: 8,
};

export interface PopularItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly score: number;
}

export const trendingJourneys = (
  records: readonly JourneyFacetRecord[],
  config: PopularConfig = DEFAULT_POPULAR_CONFIG,
): readonly PopularItem[] => {
  const scored = records.map((r) => ({
    id: r.journey.id,
    slug: r.journey.slug,
    name: r.journey.name,
    kind: "journey" as const,
    score:
      r.departureCount * config.trendingWeightDepartures +
      r.durationDays * config.trendingWeightDuration,
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
  return scored.slice(0, config.limit);
};

const popularByJourneyCount = (
  records: readonly JourneyFacetRecord[],
  groupKey: (r: JourneyFacetRecord) => readonly string[],
  resolve: (id: string) => { slug: string; name: string } | null,
  kind: EntityKind,
  limit: number,
): readonly PopularItem[] => {
  const counts = new Map<string, number>();
  for (const r of records) for (const id of groupKey(r)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const out: PopularItem[] = [];
  for (const [id, score] of counts) {
    const e = resolve(id);
    if (!e) continue;
    out.push({ id, slug: e.slug, name: e.name, kind, score });
  }
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
  return out.slice(0, limit);
};

export const featuredDestinations = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  limit = 8,
): readonly PopularItem[] =>
  popularByJourneyCount(
    records,
    (f) => f.destinationIds,
    (id) => {
      const d = r.destinations.get(id);
      return d.ok ? { slug: d.value.slug, name: d.value.name } : null;
    },
    "destination",
    limit,
  );

export const featuredOperators = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  limit = 8,
): readonly PopularItem[] =>
  popularByJourneyCount(
    records,
    (f) => [f.operatorId],
    (id) => {
      const o = r.operators.get(id);
      return o.ok ? { slug: o.value.slug, name: o.value.name } : null;
    },
    "operator",
    limit,
  );

export const featuredTrains = (
  r: ContentRegistries,
  records: readonly JourneyFacetRecord[],
  limit = 8,
): readonly PopularItem[] =>
  popularByJourneyCount(
    records,
    (f) => [f.trainId],
    (id) => {
      const t = r.trains.get(id);
      return t.ok ? { slug: t.value.slug, name: t.value.name } : null;
    },
    "train",
    limit,
  );

/**
 * Recently indexed content — given an ordered list of indexed ids (most recent
 * last), surface the most recent documents from the index.
 */
export const recentlyIndexed = (
  index: GlobalSearchIndex,
  indexedOrder: readonly string[],
  limit = 8,
): readonly SearchDocument[] => {
  const lookup = new Map(index.documents.map((d) => [`${d.kind}:${d.id}`, d]));
  const out: SearchDocument[] = [];
  for (let i = indexedOrder.length - 1; i >= 0 && out.length < limit; i--) {
    const d = lookup.get(indexedOrder[i]);
    if (d) out.push(d);
  }
  return out;
};

/* ==========================================================================
 * 8. Search Analytics Model (persistence-free)
 * ======================================================================== */

export interface SearchAnalytics {
  readonly rawQuery: string;
  readonly normalizedQuery: string;
  readonly terms: readonly string[];
  readonly resultCount: number;
  readonly zeroResults: boolean;
  readonly appliedFilters: readonly string[];
  readonly filterCount: number;
}

export const analyzeSearch = (
  rawQuery: string,
  resultCount: number,
  filters: FacetFilters = {},
): SearchAnalytics => {
  const appliedFilters = Object.entries(filters)
    .filter(([, v]) => v != null && v !== "" && v !== false)
    .map(([k]) => k)
    .sort();
  const normalizedQuery = normalizeQuery(rawQuery);
  return {
    rawQuery,
    normalizedQuery,
    terms: tokenize(rawQuery),
    resultCount,
    zeroResults: resultCount === 0,
    appliedFilters,
    filterCount: appliedFilters.length,
  };
};

/** Aggregate filter usage across many analytics records (in-memory only). */
export const aggregateFilterUsage = (events: readonly SearchAnalytics[]): readonly FacetCount[] =>
  countValues(events.flatMap((e) => e.appliedFilters));
