// Vertical product templates — client-safe.
//
// Every luxury product line the platform sells is described here as data:
// which journey collections feed it, which detail sections render, which
// specification fields are shown, how it is transacted, and what the AI
// Concierge should be primed with. Partner feeds populate the journey model;
// this registry decides how each vertical is presented. Adding a new product
// line is a configuration change, not a code change.

export type JourneySection =
  | "overview"
  | "highlights"
  | "itinerary"
  | "map"
  | "gallery"
  | "vessel"
  | "residence"
  | "inclusions"
  | "extensions"
  | "departures"
  | "availability"
  | "reviews"
  | "documents"
  | "faqs"
  | "terms";

export type TransactionMode = "instant-book" | "request-to-book" | "quote-only";

export interface VerticalTemplate {
  id: string;
  label: string;
  /** Public collection route this vertical is browsed from. */
  routeBase: string;
  /** Journey `collectionKind` values that belong to this vertical. */
  collectionKinds: string[];
  tagline: string;
  /** Sections rendered on the detail page, in order. */
  sections: JourneySection[];
  /** Specification chips shown in the summary strip. */
  specs: ("duration" | "route" | "group" | "rating" | "vessel" | "cabins" | "guides" | "meals")[];
  transaction: TransactionMode;
  /** Facets exposed by search and the collection toolbar. */
  facets: string[];
  /** Priming sentence handed to the AI Concierge from a detail page. */
  conciergePrompt: string;
  /** Schema.org type used for structured data. */
  schemaType: "TouristTrip" | "TouristAttraction" | "LodgingBusiness" | "Product";
}

export const VERTICAL_TEMPLATES: VerticalTemplate[] = [
  {
    id: "luxury-tours",
    label: "Luxury tours",
    routeBase: "/tours",
    collectionKinds: ["tours", "cultural", "small-group"],
    tagline: "Escorted and privately guided journeys with resident experts.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "inclusions",
      "extensions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "group", "rating"],
    transaction: "request-to-book",
    facets: ["region", "country", "duration", "price", "departureMonth", "groupSize", "interest"],
    conciergePrompt: "Compare this escorted journey with similar departures and dates.",
    schemaType: "TouristTrip",
  },
  {
    id: "expedition-cruises",
    label: "Expedition cruises",
    routeBase: "/expedition-cruises",
    collectionKinds: ["cruises-expedition", "expedition"],
    tagline: "Small expedition vessels, zodiac landings and onboard scientists.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "vessel",
      "inclusions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "guides"],
    transaction: "request-to-book",
    facets: ["region", "vessel", "duration", "price", "departureMonth", "cabinClass"],
    conciergePrompt: "Advise on expedition vessels, cabin grades and the best season to sail.",
    schemaType: "TouristTrip",
  },
  {
    id: "river-cruises",
    label: "River cruises",
    routeBase: "/river-cruises",
    collectionKinds: ["river-cruises", "rivers"],
    tagline: "All-suite river ships on Europe's, Asia's and Africa's great waterways.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "vessel",
      "inclusions",
      "extensions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "meals"],
    transaction: "request-to-book",
    facets: ["river", "region", "duration", "price", "departureMonth", "cabinClass"],
    conciergePrompt: "Recommend river itineraries, suite categories and shore excursions.",
    schemaType: "TouristTrip",
  },
  {
    id: "ocean-cruises",
    label: "Ocean cruises",
    routeBase: "/cruises",
    collectionKinds: ["cruises", "world-cruises"],
    tagline: "All-inclusive ocean voyages and world cruise segments.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "vessel",
      "inclusions",
      "extensions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "meals"],
    transaction: "request-to-book",
    facets: ["ship", "region", "duration", "price", "departureMonth", "cabinClass", "port"],
    conciergePrompt: "Compare sailings, suite categories and fare inclusions on this voyage.",
    schemaType: "TouristTrip",
  },
  {
    id: "private-journeys",
    label: "Private journeys",
    routeBase: "/journeys",
    collectionKinds: ["private", "honeymoon"],
    tagline: "Exclusively yours — private guiding, transport and access throughout.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "inclusions",
      "extensions",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "group", "guides"],
    transaction: "quote-only",
    facets: ["region", "country", "duration", "price", "interest", "luxuryLevel"],
    conciergePrompt: "Design a private version of this journey for my dates and party.",
    schemaType: "TouristTrip",
  },
  {
    id: "tailor-made",
    label: "Tailor-made journeys",
    routeBase: "/tailor-made",
    collectionKinds: ["tailor-made"],
    tagline: "A starting point — every element is rewritten around you.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "inclusions",
      "extensions",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "group"],
    transaction: "quote-only",
    facets: ["region", "country", "duration", "price", "interest", "luxuryLevel"],
    conciergePrompt: "Build a tailor-made itinerary using this journey as the framework.",
    schemaType: "TouristTrip",
  },
  {
    id: "safari",
    label: "Safari",
    routeBase: "/safari",
    collectionKinds: ["safari"],
    tagline: "Private conservancies, mobile camps and specialist guides.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "residence",
      "inclusions",
      "extensions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "group", "guides", "meals"],
    transaction: "request-to-book",
    facets: ["country", "reserve", "season", "duration", "price", "familyFriendly"],
    conciergePrompt: "Advise on camps, migration timing and flying-safari logistics.",
    schemaType: "TouristTrip",
  },
  {
    id: "villas",
    label: "Villas & residences",
    routeBase: "/villas",
    collectionKinds: ["villas"],
    tagline: "Staffed private residences with concierge and chef.",
    sections: [
      "overview",
      "highlights",
      "residence",
      "gallery",
      "map",
      "inclusions",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["route", "group", "meals", "rating"],
    transaction: "request-to-book",
    facets: ["destination", "bedrooms", "price", "month", "familyFriendly", "amenities"],
    conciergePrompt: "Check availability, staffing and rates for this residence.",
    schemaType: "LodgingBusiness",
  },
  {
    id: "yachts",
    label: "Yacht charters",
    routeBase: "/yachts",
    collectionKinds: ["yachts"],
    tagline: "Crewed motor and sailing yachts chartered by the week.",
    sections: [
      "overview",
      "highlights",
      "vessel",
      "itinerary",
      "map",
      "gallery",
      "inclusions",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "group"],
    transaction: "quote-only",
    facets: ["cruisingArea", "guests", "cabins", "price", "month", "yachtType"],
    conciergePrompt: "Shortlist yachts for my party size, cruising area and week.",
    schemaType: "Product",
  },
  {
    id: "rail",
    label: "Rail journeys",
    routeBase: "/rail",
    collectionKinds: ["rail"],
    tagline: "Legendary trains and private carriages across continents.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "vessel",
      "inclusions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "meals"],
    transaction: "request-to-book",
    facets: ["train", "region", "duration", "price", "departureMonth", "cabinClass"],
    conciergePrompt: "Compare cabin grades and departure dates on this rail journey.",
    schemaType: "TouristTrip",
  },
  {
    id: "polar",
    label: "Polar expeditions",
    routeBase: "/polar-expeditions",
    collectionKinds: ["polar"],
    tagline: "Antarctica, the Arctic and the Northwest Passage.",
    sections: [
      "overview",
      "highlights",
      "itinerary",
      "map",
      "gallery",
      "vessel",
      "inclusions",
      "departures",
      "availability",
      "reviews",
      "documents",
      "faqs",
      "terms",
    ],
    specs: ["duration", "route", "vessel", "cabins", "guides"],
    transaction: "request-to-book",
    facets: ["region", "vessel", "duration", "price", "departureMonth", "activities"],
    conciergePrompt: "Advise on polar seasons, vessels, ice class and activity options.",
    schemaType: "TouristTrip",
  },
];

const BY_KIND = new Map<string, VerticalTemplate>();
for (const t of VERTICAL_TEMPLATES) for (const k of t.collectionKinds) BY_KIND.set(k, t);

export function getTemplate(id: string): VerticalTemplate | null {
  return VERTICAL_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Resolve the presentation template for any journey collection kind. */
export function templateForKind(collectionKind: string): VerticalTemplate {
  return BY_KIND.get(collectionKind) ?? VERTICAL_TEMPLATES[0];
}

export function hasSection(template: VerticalTemplate, section: JourneySection): boolean {
  return template.sections.includes(section);
}

export const TEMPLATE_IDS = VERTICAL_TEMPLATES.map((t) => t.id);
