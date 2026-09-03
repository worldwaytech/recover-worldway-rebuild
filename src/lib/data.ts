import { images } from "./data-images";
export { images } from "./data-images";

export type Availability =
  | "Available"
  | "Limited Availability"
  | "On Request"
  | "Sold Out"
  | "Waitlist Open";

export interface Region {
  slug: string;
  name: string;
  image: string;
  blurb: string;
  countries: string[];
  intro?: string;
  highlights?: string[];
  experiences?: string[];
  whenToGo?: string;
}

export interface Destination {
  slug: string;
  name: string;
  region: string;
  image: string;
  tagline: string;
  overview: string;
  highlights: string[];
  bestTime: string;
  styles: string[];
  faqs: { q: string; a: string }[];
}

export function formatJourneyTitle(slug: string, title?: string) {
  if (title && title.trim()) return title.trim();
  return slug
    .split("-")
    .filter(Boolean)
    .map((seg) =>
      seg.length <= 3 ? seg.toUpperCase() : `${seg[0].toUpperCase()}${seg.slice(1)}`,
    )
    .join(" ");
}

export interface Journey {
  slug: string;
  title: string;
  destination: string;
  country: string;
  region: string;
  category: string;
  style: string[];
  duration: number;
  priceFrom: number | null;
  availability: Availability;
  departures: string[];
  featured: boolean;
  bestseller?: boolean;
  image: string;
  overview: string;
  highlights: string[];
  itinerary: { day: string; title: string; text: string }[];
  inclusions: string[];
  exclusions: string[];
  accommodations: string[];
  faqs: { q: string; a: string }[];
  // Optional enrichment populated for records reconciled from the A&K source catalogue.
  images?: string[];
  mapImage?: string;
  countries?: string[];
  destinations?: string[];
  groupSize?: number;
  journeyType?: string;
  sourceCategories?: string[];
  departureDates?: {
    start: string;
    end: string;
    code?: string | null;
    status?: string | null;
    priceUsd?: number | null;
  }[];
  sourceId?: string;
  sourceCode?: string;
  sourceSlug?: string;
  sourceUrl?: string;
  sourceYears?: number[];
  sourceUpdatedAt?: string;
}

export interface Category {
  slug: string;
  name: string;
  image: string;
  blurb: string;
}

export const regions: Region[] = [
  {
    slug: "africa",
    name: "Africa",
    image: images.africa,
    blurb:
      "Legendary safaris, Great Migration spectacles and gracious lodges beneath endless skies.",
    countries: ["Tanzania", "Kenya", "Botswana", "South Africa", "Rwanda", "Namibia"],
    intro:
      "Africa is the birthplace of the safari and the soul of Worldway Luxe. From the thundering hooves of the Great Migration to the lily-strewn channels of the Okavango, the mountain gorillas of Rwanda and the cosmopolitan glamour of Cape Town, this is a continent of raw beauty and deep-rooted culture.",
    highlights: [
      "The Great Migration across the Serengeti-Mara",
      "Mountain gorilla trekking in Rwanda",
      "Okavango Delta water safaris",
      "Cape Town, Winelands & Victoria Falls",
    ],
    whenToGo: "June to October for classic safari; November to March for green-season birding.",
  },
  {
    slug: "asia",
    name: "Asia",
    image: images.asia,
    blurb: "Ancient temples, refined ryokan, and culinary journeys across timeless landscapes.",
    countries: ["Japan", "Bhutan", "Vietnam", "India", "Thailand", "Sri Lanka", "Maldives"],
    intro:
      "Asia rewards the curious traveller like nowhere else — the marble perfection of the Taj Mahal, lantern-lit Kyoto lanes, the temples of Angkor, the Himalayan kingdom of Bhutan and the turquoise lagoons of the Maldives.",
    highlights: [
      "Taj Mahal & royal Rajasthan",
      "Cherry blossom & ryokan in Japan",
      "Angkor Wat & the Mekong",
      "Maldives overwater luxury",
    ],
    whenToGo: "October to March for the subcontinent and Southeast Asia.",
  },
  {
    slug: "europe",
    name: "Europe",
    image: images.europe,
    blurb: "Storied coastlines, private palazzos and the art of unhurried discovery.",
    countries: ["Italy", "France", "Greece", "Portugal", "Spain", "Iceland"],
    intro:
      "Europe is the art of living, refined over centuries — after-hours at the Louvre, a private cruise along the Amalfi Coast, Champagne in historic cellars and the whitewashed islands of the Aegean.",
    highlights: [
      "Amalfi Coast & Tuscany",
      "Paris, Champagne & Provence",
      "Greek isles by private yacht",
      "Iceland's fire, ice & aurora",
    ],
    whenToGo: "May, June, September and October for warmth without the crowds.",
  },
  {
    slug: "middle-east",
    name: "Middle East",
    image: images.middleEast,
    blurb: "Golden dunes, visionary cities and the warm tradition of Arabian hospitality.",
    countries: ["UAE", "Jordan", "Oman", "Egypt", "Morocco"],
    intro:
      "The Middle East blends ancient wonder with visionary modernity — the pyramids of Giza at dawn, the rose-red city of Petra, the silent dunes of the Empty Quarter and the glittering skylines of the Gulf.",
    highlights: [
      "Pyramids of Giza & the Nile",
      "Petra & Wadi Rum, Jordan",
      "Empty Quarter dunes of Oman",
      "Marrakech & the Sahara",
    ],
    whenToGo: "October to April for comfortable temperatures.",
  },
  {
    slug: "north-america",
    name: "North America",
    image: images.northAmerica,
    blurb: "Soaring national parks, vibrant cities and grand wilderness lodges across the New World.",
    countries: ["United States", "Canada", "Mexico", "Costa Rica", "Alaska"],
    intro:
      "North America spans staggering scale and variety — the canyons of the Southwest, the geysers of Yellowstone, the turquoise lakes of the Canadian Rockies and the rainforests of Costa Rica.",
    highlights: [
      "American West national parks",
      "Canadian Rockies & luxury rail",
      "Alaska's glaciers & wildlife",
      "Costa Rica rainforests & coast",
    ],
    whenToGo: "May to September for the parks and Rockies.",
  },
  {
    slug: "south-america",
    name: "South America",
    image: images.southAmerica,
    blurb: "Lost cities, Amazon waterways and the soulful rhythm of a vivid continent.",
    countries: ["Peru", "Argentina", "Chile", "Brazil", "Ecuador"],
    intro:
      "South America is a continent of soul and spectacle — the lost Inca citadel of Machu Picchu, the granite towers of Patagonia, the thundering Iguazú Falls, the wildlife of the Galápagos and the rhythm of Rio.",
    highlights: [
      "Machu Picchu & the Sacred Valley",
      "Patagonia's peaks & glaciers",
      "Galápagos by private yacht",
      "Rio, the Amazon & Iguazú",
    ],
    whenToGo: "May to September for the Andes; November to March for Patagonia.",
  },
  {
    slug: "oceania",
    name: "Oceania",
    image: images.oceania,
    blurb: "Coral seas, dramatic fjords and Indigenous wonders across Australia and the Pacific.",
    countries: ["Australia", "New Zealand", "Fiji", "French Polynesia"],
    intro:
      "Oceania is a world of astonishing contrasts — the living wonder of the Great Barrier Reef, the spiritual heart of Uluru, the mirror fjords of New Zealand and the overwater serenity of the South Pacific.",
    highlights: [
      "Great Barrier Reef & Sydney",
      "Uluru & the Red Centre",
      "New Zealand's fjords & lodges",
      "Fiji & South Pacific islands",
    ],
    whenToGo: "September to November and March to May for Australia.",
  },
  {
    slug: "polar",
    name: "Antarctica & Polar",
    image: images.polar,
    blurb: "The last great wilderness — expedition voyages to the ends of the earth.",
    countries: ["Antarctica", "Arctic", "Greenland", "Svalbard"],
    intro:
      "The polar regions are the last great wilderness on earth — colossal icebergs, vast penguin colonies, polar bears on the pack ice and a silence found nowhere else.",
    highlights: [
      "Antarctic Peninsula expeditions",
      "Polar bears of Svalbard",
      "Zodiac cruising among icebergs",
      "Penguin & seal colonies",
    ],
    whenToGo: "November to March for Antarctica's summer.",
  },
];

export const categories: Category[] = [
  { slug: "all-journeys", name: "All Journeys", image: images.hero, blurb: "Our complete collection of extraordinary, expertly crafted journeys." },
  { slug: "small-group-journeys", name: "Small Group Journeys", image: images.smallGroup, blurb: "Intimate departures, limited guests, and seamless shared discovery." },
  { slug: "private-ready-to-book", name: "Private Ready-to-Book", image: images.europe, blurb: "Curated private itineraries ready to reserve and refine to your taste." },
  { slug: "expedition-cruises", name: "Expedition Cruises", image: images.cruise, blurb: "Small-ship voyages to remote coastlines and polar frontiers." },
  { slug: "canal-barge-cruises", name: "Canal & Barge Cruises", image: images.europe, blurb: "Boutique barges drifting through Europe's wine country, canals and waterways." },
  { slug: "private-jet-journeys", name: "Private Jet Journeys", image: images.jet, blurb: "Circle the globe in privacy aboard a fully chartered private jet." },
  { slug: "charters", name: "Charters", image: images.charter, blurb: "Wholly private yacht, villa and camp charters, designed around you." },
  { slug: "tailor-made", name: "Tailor-Made", image: images.asia, blurb: "A journey written entirely for you, from first idea to final farewell." },
  { slug: "family", name: "Luxury Family Travel", image: images.southAmerica, blurb: "Multi-generational adventures that delight every age." },
  { slug: "honeymoon", name: "Honeymoon & Romance", image: images.middleEast, blurb: "Intimate escapes for life's most treasured celebrations." },
  { slug: "safari", name: "Wildlife & Safari", image: images.africa, blurb: "Front-row encounters with the natural world's greatest theatre." },
  { slug: "culture", name: "Culture & Heritage", image: images.asia, blurb: "Private access to the world's living history and traditions." },
  { slug: "beach", name: "Beach & Island Escapes", image: images.europe, blurb: "Secluded shores and barefoot luxury across hidden archipelagos." },
];

// TODO(Cloud): full destination catalogue (~40+ entries) migrated from CMS.
export const destinations: Destination[] = regions.map((r) => ({
  slug: r.slug,
  name: r.name,
  region: r.slug,
  image: r.image,
  tagline: r.blurb,
  overview: r.intro ?? r.blurb,
  highlights: r.highlights ?? [],
  bestTime: r.whenToGo ?? "Year-round with seasonal variations.",
  styles: ["Tailor-Made"],
  faqs: [],
}));

// TODO(Cloud): full journeys catalogue moves to Supabase. This is a curated
// static seed that keeps the marketing site and JourneyCard types functional.
export const journeys: Journey[] = [
  {
    slug: "serengeti-migration-safari",
    title: "Serengeti Migration Safari",
    destination: "Tanzania",
    country: "Tanzania",
    region: "africa",
    category: "safari",
    style: ["Wildlife & Safari", "Small Group"],
    duration: 10,
    priceFrom: 18500,
    availability: "Limited Availability",
    departures: ["Jul 2026", "Aug 2026", "Sep 2026"],
    featured: true,
    bestseller: true,
    image: images.africa,
    overview:
      "Follow the herds across the Serengeti-Mara with front-row access to river crossings, staying in exclusive mobile camps positioned along the migration route.",
    highlights: [
      "River-crossing front-row camps",
      "Master private guide throughout",
      "Balloon safari over the plains",
      "Ngorongoro Crater descent",
    ],
    itinerary: [],
    inclusions: ["Private guide", "Charter flights", "All meals", "Park fees"],
    exclusions: ["International flights", "Travel insurance"],
    accommodations: ["Singita Sabora", "&Beyond Klein's Camp", "Sanctuary Kichakani"],
    faqs: [],
  },
  {
    slug: "imperial-japan-in-private",
    title: "Imperial Japan in Private",
    destination: "Japan",
    country: "Japan",
    region: "asia",
    category: "culture",
    style: ["Culture & Heritage", "Tailor-Made"],
    duration: 12,
    priceFrom: 22000,
    availability: "Available",
    departures: ["Mar 2026", "Apr 2026", "Oct 2026"],
    featured: true,
    image: images.asia,
    overview:
      "A private journey through Tokyo, Kyoto, Hakone and Kanazawa with heritage ryokan, master tea ceremonies and Michelin-starred kaiseki dining.",
    highlights: [
      "Private tea ceremony with a master",
      "Heritage ryokan with onsen",
      "After-hours temple access",
      "Bullet-train explorations",
    ],
    itinerary: [],
    inclusions: ["Private guide", "Bullet-train transfers", "Ryokan stays"],
    exclusions: ["International flights"],
    accommodations: ["Aman Tokyo", "Hoshinoya Kyoto", "Beniya Mukayu"],
    faqs: [],
  },
  {
    slug: "antarctica-expedition-voyage",
    title: "Antarctica Expedition Voyage",
    destination: "Antarctica",
    country: "Antarctica",
    region: "polar",
    category: "expedition-cruises",
    style: ["Expedition Cruise", "Adventure"],
    duration: 14,
    priceFrom: 31500,
    availability: "On Request",
    departures: ["Dec 2026", "Jan 2027", "Feb 2027"],
    featured: true,
    image: images.polar,
    overview:
      "Sail the Antarctic Peninsula aboard an intimate expedition ship with daily Zodiac landings, expert naturalists and optional kayaking among icebergs.",
    highlights: [
      "Daily Zodiac landings",
      "Expert polar naturalists",
      "Optional sea kayaking",
      "Fly-cruise option to skip the Drake",
    ],
    itinerary: [],
    inclusions: ["All shore excursions", "Expedition parka", "Full board"],
    exclusions: ["International flights"],
    accommodations: ["Silversea Silver Endeavour"],
    faqs: [],
  },
  {
    slug: "wonders-by-private-jet",
    title: "Wonders by Private Jet",
    destination: "World Circumnavigation",
    country: "Multiple",
    region: "world",
    category: "private-jet-journeys",
    style: ["Private Jet", "Small Group"],
    duration: 24,
    priceFrom: 148000,
    availability: "Waitlist Open",
    departures: ["Feb 2027"],
    featured: true,
    bestseller: true,
    image: images.jet,
    overview:
      "Circle the globe aboard a fully chartered private jet, linking twelve of the world's most extraordinary destinations with expert guides and the finest hotels at every stop.",
    highlights: [
      "Fully chartered private jet",
      "Twelve world wonders in one journey",
      "Onboard lecturers & physicians",
      "The finest hotels at each stop",
    ],
    itinerary: [],
    inclusions: ["All flights", "All hotels", "All meals", "All excursions"],
    exclusions: ["Travel insurance"],
    accommodations: ["Curated Aman, Rosewood & Four Seasons properties"],
    faqs: [],
  },
  {
    slug: "amalfi-and-tuscany-private",
    title: "Amalfi & Tuscany in Private",
    destination: "Italy",
    country: "Italy",
    region: "europe",
    category: "private-ready-to-book",
    style: ["Culture & Heritage", "Beach & Island", "Honeymoon"],
    duration: 11,
    priceFrom: 14800,
    availability: "Available",
    departures: ["May 2026", "Jun 2026", "Sep 2026"],
    featured: true,
    image: images.europe,
    overview:
      "Private drives along the Amalfi Coast, a coastal yacht day and Tuscan wine estate dinners — la dolce vita, perfectly staged.",
    highlights: [
      "Private Amalfi coastal cruise",
      "Tuscan wine estate dining",
      "After-hours Vatican access",
      "Cinque Terre by boat",
    ],
    itinerary: [],
    inclusions: ["Private driver-guide", "All accommodation", "Selected meals"],
    exclusions: ["International flights"],
    accommodations: ["Il San Pietro di Positano", "Castello di Casole"],
    faqs: [],
  },
  {
    slug: "machu-picchu-private-journey",
    title: "Machu Picchu Private Journey",
    destination: "Peru",
    country: "Peru",
    region: "south-america",
    category: "private-ready-to-book",
    style: ["Culture & Heritage", "Adventure"],
    duration: 9,
    priceFrom: 12400,
    availability: "Available",
    departures: ["May 2026", "Jun 2026", "Aug 2026", "Sep 2026"],
    featured: true,
    image: images.southAmerica,
    overview:
      "Trace the Inca trail through the Sacred Valley to a dawn arrival at Machu Picchu, with luxury observation-train travel and Lima's celebrated dining scene.",
    highlights: [
      "Private dawn at Machu Picchu",
      "Luxury observation-rail journey",
      "Sacred Valley heritage",
      "Lima's celebrated dining",
    ],
    itinerary: [],
    inclusions: ["Private guide", "Rail transfers", "Selected meals"],
    exclusions: ["International flights"],
    accommodations: ["Sumaq Machu Picchu", "Palacio Nazarenas", "Country Club Lima"],
    faqs: [],
  },
];

export const testimonials = [
  {
    name: "Eleanor & James W.",
    trip: "Serengeti Migration Safari",
    rating: 5,
    quote:
      "From the first call to the final farewell, every detail was anticipated. The migration left us speechless — the service kept us grounded in pure comfort.",
  },
  {
    name: "The Hartley Family",
    trip: "Imperial Japan in Private",
    rating: 5,
    quote:
      "Three generations travelled together and not one of us wanted for anything. Worldway opened doors we never imagined possible.",
  },
  {
    name: "Dr. Priya N.",
    trip: "Antarctica Expedition Voyage",
    rating: 5,
    quote:
      "The expedition team were extraordinary and the ship sublime. A genuine once-in-a-lifetime journey, flawlessly delivered.",
  },
  {
    name: "Marcus L.",
    trip: "Wonders by Private Jet",
    rating: 5,
    quote:
      "Circumnavigating the globe in this manner is travel at its most effortless. World-class throughout — a true partner in Worldway Luxe x A&K's tradition.",
  },
];

export const blogPosts = [
  {
    slug: "great-migration-when-to-go",
    title: "The Great Migration: When and Where to Witness It",
    region: "africa",
    image: images.africa,
    excerpt: "A month-by-month guide to following the Serengeti's greatest wildlife spectacle in absolute comfort.",
    date: "2026-04-18",
    read: "6 min read",
    body: "The Great Migration is not a single event but a year-round journey of nearly two million animals across the Serengeti-Mara ecosystem.",
  },
  {
    slug: "art-of-the-private-jet-journey",
    title: "The Art of the Private Jet Journey",
    region: "asia",
    image: images.jet,
    excerpt: "Why circling the globe by private jet is the most effortless way to see the world's wonders.",
    date: "2026-03-30",
    read: "5 min read",
    body: "A private jet journey collapses distance and dissolves friction.",
  },
  {
    slug: "japan-beyond-the-blossom",
    title: "Japan Beyond the Blossom",
    region: "asia",
    image: images.asia,
    excerpt: "Discover the quiet seasons and hidden corners that reward the unhurried traveller.",
    date: "2026-03-12",
    read: "7 min read",
    body: "Cherry blossom season is rightly celebrated, but Japan rewards travellers in every season.",
  },
  {
    slug: "antarctica-the-last-wilderness",
    title: "Antarctica: Planning the Voyage of a Lifetime",
    region: "polar",
    image: images.polar,
    excerpt: "Everything to consider before sailing to the white continent in comfort.",
    date: "2026-02-20",
    read: "8 min read",
    body: "Antarctica is the most humbling place on earth, and reaching it has never been more comfortable.",
  },
];

export const availabilityColors: Record<Availability, string> = {
  Available: "bg-forest/10 text-forest border-forest/30",
  "Limited Availability": "bg-gold/15 text-gold-foreground border-gold/40",
  "On Request": "bg-navy/10 text-navy border-navy/30",
  "Sold Out": "bg-destructive/10 text-destructive border-destructive/30",
  "Waitlist Open": "bg-muted text-muted-foreground border-border",
};

export const styleOptions = [
  "Wildlife & Safari",
  "Culture & Heritage",
  "Honeymoon",
  "Family",
  "Adventure",
  "Beach & Island",
  "Small Group",
  "Expedition Cruise",
  "Tailor-Made",
];

export function formatPrice(p: number | null) {
  return p === null ? "Price on Request" : `From $${p.toLocaleString("en-US")} pp`;
}
