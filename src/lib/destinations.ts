// Global destination architecture:
// World → Region → Country → State/Province → Destination/City
// Every node carries SEO copy, hero media, coordinates for maps, FAQs and
// links into the journey + catalogue layers.
import { images } from "./data-images";
import { filterJourneys, type Journey } from "./journeys";
import { catalogueIndex } from "./catalogue-engine";
import type { CatalogueProduct } from "./catalogue-types";

export interface DestinationNode {
  slug: string;
  name: string;
  state?: string;
  blurb: string;
  lat: number;
  lng: number;
  bestMonths: string[];
  keywords: string[];
}

export interface CountryNode {
  slug: string;
  name: string;
  code: string;
  blurb: string;
  states: string[];
  heroImage: string;
  destinations: DestinationNode[];
}

export interface RegionNode {
  slug: string;
  name: string;
  headline: string;
  intro: string;
  heroImage: string;
  countries: CountryNode[];
}

const d = (
  slug: string,
  name: string,
  blurb: string,
  lat: number,
  lng: number,
  bestMonths: string[],
  keywords: string[] = [],
  state?: string,
): DestinationNode => ({ slug, name, blurb, lat, lng, bestMonths, keywords, state });

export const WORLD: RegionNode[] = [
  {
    slug: "africa",
    name: "Africa",
    headline: "Africa & the Indian Ocean",
    intro:
      "Private conservancies, water-based safaris and the Nile's temple corridor — Africa rewards travellers who go slowly, with the right guide and the right camp.",
    heroImage: images.africa,
    countries: [
      {
        slug: "botswana",
        name: "Botswana",
        code: "BW",
        blurb:
          "Low-volume, high-value safari at its purest: water, wildlife and camps that never crowd a sighting.",
        states: ["North-West District", "Chobe District"],
        heroImage: images.africa,
        destinations: [
          d(
            "okavango-delta",
            "Okavango Delta",
            "Seasonal floodplain wilderness explored by mokoro, boat and on foot.",
            -19.28,
            22.94,
            ["May", "June", "July", "August", "September"],
            ["mokoro", "big five"],
            "North-West District",
          ),
          d(
            "chobe",
            "Chobe",
            "The greatest elephant concentrations in Africa along a single river frontage.",
            -18.66,
            24.5,
            ["June", "July", "August", "September"],
            ["elephant", "river cruise"],
            "Chobe District",
          ),
        ],
      },
      {
        slug: "egypt",
        name: "Egypt",
        code: "EG",
        blurb:
          "Pharaonic Egypt travelled slowly — private permits, an Egyptologist and a dahabiya under sail.",
        states: ["Cairo Governorate", "Luxor Governorate", "Aswan Governorate"],
        heroImage: images.middleEast,
        destinations: [
          d(
            "cairo",
            "Cairo",
            "The Grand Egyptian Museum, Giza at first light and Islamic Cairo's craft quarters.",
            30.04,
            31.24,
            ["October", "November", "February", "March"],
            ["pyramids", "museum"],
            "Cairo Governorate",
          ),
          d(
            "luxor",
            "Luxor",
            "Karnak, the Valley of the Kings and balloon flights over the West Bank.",
            25.69,
            32.64,
            ["November", "December", "January", "February"],
            ["temples", "tombs"],
            "Luxor Governorate",
          ),
          d(
            "aswan",
            "Aswan",
            "Nubian villages, Philae and the Nile at its most languid.",
            24.09,
            32.9,
            ["November", "December", "January"],
            ["nile", "philae"],
            "Aswan Governorate",
          ),
        ],
      },
      {
        slug: "kenya",
        name: "Kenya",
        code: "KE",
        blurb: "Conservancy safaris beside the Mara, paired with Indian Ocean finales.",
        states: ["Narok County", "Laikipia County"],
        heroImage: images.africa,
        destinations: [
          d(
            "masai-mara",
            "Masai Mara",
            "Great Migration river crossings and private conservancy game drives.",
            -1.49,
            35.14,
            ["July", "August", "September", "October"],
            ["migration", "big cats"],
            "Narok County",
          ),
          d(
            "laikipia",
            "Laikipia",
            "Rhino conservation, horseback safari and family-friendly ranches.",
            0.36,
            36.78,
            ["January", "February", "June", "July"],
            ["rhino", "riding"],
            "Laikipia County",
          ),
        ],
      },
    ],
  },
  {
    slug: "asia",
    name: "Asia",
    headline: "Asia",
    intro:
      "From Kyoto's machiya lanes to Rajasthan's palace courtyards, Asia's luxury travel is defined by access — the private tea room, the closed temple, the residence dinner.",
    heroImage: images.asia,
    countries: [
      {
        slug: "japan",
        name: "Japan",
        code: "JP",
        blurb:
          "Seasonal precision — sakura, momiji and snow — with ryokan craftsmanship and Michelin density.",
        states: ["Kanto", "Kansai", "Chugoku"],
        heroImage: images.asia,
        destinations: [
          d(
            "tokyo",
            "Tokyo",
            "Michelin dining, contemporary art and Aman-level city stays.",
            35.68,
            139.69,
            ["March", "April", "October", "November"],
            ["sushi", "art"],
            "Kanto",
          ),
          d(
            "kyoto",
            "Kyoto",
            "Private temple access, tea ceremony and Arashiyama before dawn.",
            35.01,
            135.77,
            ["March", "April", "November"],
            ["temples", "geisha"],
            "Kansai",
          ),
        ],
      },
      {
        slug: "india",
        name: "India",
        code: "IN",
        blurb: "Palace hotels, royal hosts and tiger reserves connected by private aviation.",
        states: ["Rajasthan", "Delhi NCR", "Kerala"],
        heroImage: images.india,
        destinations: [
          d(
            "delhi",
            "Delhi",
            "Mughal monuments, Sufi music and the gateway to Rajasthan.",
            28.61,
            77.21,
            ["October", "November", "February", "March"],
            ["heritage"],
            "Delhi NCR",
          ),
          d(
            "jaipur",
            "Jaipur",
            "Amber Fort at opening, block-printing ateliers and Rambagh Palace.",
            26.91,
            75.79,
            ["November", "December", "January", "February"],
            ["palaces"],
            "Rajasthan",
          ),
          d(
            "udaipur",
            "Udaipur",
            "Lake Pichola, Taj Lake Palace and the Aravalli foothills.",
            24.57,
            73.69,
            ["October", "November", "February", "March"],
            ["lakes", "romance"],
            "Rajasthan",
          ),
        ],
      },
    ],
  },
  {
    slug: "europe",
    name: "Europe",
    headline: "Europe & the Mediterranean",
    intro:
      "Private villas above the Amalfi Coast, all-suite Mediterranean sailings and rail journeys through the Alps — Europe at its most considered.",
    heroImage: images.europe,
    countries: [
      {
        slug: "italy",
        name: "Italy",
        code: "IT",
        blurb:
          "Coastline, cuisine and craftsmanship — chartered yachts, villa estates and cellar dinners.",
        states: ["Campania", "Sicily", "Tuscany"],
        heroImage: images.europe,
        destinations: [
          d(
            "amalfi-coast",
            "Amalfi Coast",
            "Cliffside villas, lemon groves and tender access to hidden coves.",
            40.63,
            14.6,
            ["May", "June", "September", "October"],
            ["coast", "villas"],
            "Campania",
          ),
          d(
            "capri",
            "Capri",
            "Blue Grotto at dawn and Anacapri away from the day boats.",
            40.55,
            14.24,
            ["May", "June", "September"],
            ["island"],
            "Campania",
          ),
          d(
            "sicily",
            "Sicily",
            "Taormina, Etna wine estates and Baroque Val di Noto.",
            37.6,
            14.02,
            ["April", "May", "September", "October"],
            ["wine", "baroque"],
            "Sicily",
          ),
        ],
      },
      {
        slug: "spain",
        name: "Spain",
        code: "ES",
        blurb:
          "Gaudí, Basque gastronomy and the Balearics — a natural Mediterranean embarkation point.",
        states: ["Catalonia", "Balearic Islands"],
        heroImage: images.europe,
        destinations: [
          d(
            "barcelona",
            "Barcelona",
            "Modernisme, Michelin tasting menus and cruise embarkation.",
            41.39,
            2.17,
            ["April", "May", "September", "October"],
            ["gaudi", "dining"],
            "Catalonia",
          ),
        ],
      },
      {
        slug: "greece",
        name: "Greece",
        code: "GR",
        blurb: "Cycladic caldera stays, private archaeology and island-hopping by yacht.",
        states: ["South Aegean", "Attica"],
        heroImage: images.europe,
        destinations: [
          d(
            "santorini",
            "Santorini",
            "Caldera suites, Assyrtiko wineries and overnight cruise calls.",
            36.39,
            25.46,
            ["May", "June", "September"],
            ["caldera", "wine"],
            "South Aegean",
          ),
          d(
            "athens",
            "Athens",
            "Acropolis before opening and the Athens Riviera.",
            37.98,
            23.73,
            ["April", "May", "October"],
            ["acropolis"],
            "Attica",
          ),
        ],
      },
    ],
  },
  {
    slug: "south-america",
    name: "South America",
    headline: "South America",
    intro:
      "Andean archaeology, Patagonian wilderness and Amazon lodges — long distances, expertly connected.",
    heroImage: images.southAmerica,
    countries: [
      {
        slug: "peru",
        name: "Peru",
        code: "PE",
        blurb: "Inca heartland with world-class hotels, rail and gastronomy.",
        states: ["Cusco Region", "Lima Region"],
        heroImage: images.southAmerica,
        destinations: [
          d(
            "cusco",
            "Cusco",
            "Colonial altitude capital and the gateway to the Sacred Valley.",
            -13.53,
            -71.97,
            ["May", "June", "July", "August"],
            ["inca"],
            "Cusco Region",
          ),
          d(
            "machu-picchu",
            "Machu Picchu",
            "Sun Gate arrivals, citadel permits and Hiram Bingham rail.",
            -13.16,
            -72.55,
            ["May", "June", "September"],
            ["citadel", "trek"],
            "Cusco Region",
          ),
        ],
      },
    ],
  },
  {
    slug: "polar",
    name: "Polar",
    headline: "Polar Regions",
    intro:
      "Antarctica and the High Arctic aboard ice-class expedition ships with the industry's best landing ratios.",
    heroImage: images.polar,
    countries: [
      {
        slug: "antarctica",
        name: "Antarctica",
        code: "AQ",
        blurb: "Peninsula landings, penguin rookeries and the Drake Passage crossing.",
        states: ["Antarctic Peninsula", "South Shetland Islands"],
        heroImage: images.polar,
        destinations: [
          d(
            "antarctic-peninsula",
            "Antarctic Peninsula",
            "Twice-daily zodiac landings between November and February.",
            -64.5,
            -62.5,
            ["November", "December", "January", "February"],
            ["penguins", "zodiac"],
            "Antarctic Peninsula",
          ),
        ],
      },
    ],
  },
  {
    slug: "middle-east",
    name: "Middle East",
    headline: "Middle East",
    intro:
      "Desert design hotels, Nabataean archaeology and Gulf stopovers with first-class connectivity.",
    heroImage: images.middleEast,
    countries: [
      {
        slug: "jordan",
        name: "Jordan",
        code: "JO",
        blurb: "Petra by candlelight, Wadi Rum camps and the Dead Sea.",
        states: ["Ma'an Governorate", "Aqaba Governorate"],
        heroImage: images.middleEast,
        destinations: [
          d(
            "petra",
            "Petra",
            "The Siq at first light with a private archaeologist.",
            30.33,
            35.44,
            ["March", "April", "October", "November"],
            ["archaeology"],
            "Ma'an Governorate",
          ),
          d(
            "wadi-rum",
            "Wadi Rum",
            "Martian sandstone, Bedouin hosts and luxury desert camps.",
            29.58,
            35.42,
            ["March", "April", "October"],
            ["desert"],
            "Aqaba Governorate",
          ),
        ],
      },
      {
        slug: "united-arab-emirates",
        name: "United Arab Emirates",
        code: "AE",
        blurb:
          "Global hub with beach resorts, desert conservation reserves and private aviation infrastructure.",
        states: ["Dubai", "Abu Dhabi"],
        heroImage: images.middleEast,
        destinations: [
          d(
            "dubai",
            "Dubai",
            "Stopover suites, desert conservation and world-class shopping.",
            25.2,
            55.27,
            ["November", "December", "January", "February"],
            ["stopover"],
            "Dubai",
          ),
        ],
      },
    ],
  },
  {
    slug: "north-america",
    name: "North America",
    headline: "North America",
    intro:
      "Ranch country, national-park lodges and the great cities — served by our strongest air inventory.",
    heroImage: images.northAmerica,
    countries: [
      {
        slug: "united-states",
        name: "United States",
        code: "US",
        blurb: "Coast-to-coast city stays, wine country and national-park itineraries.",
        states: ["New York", "California", "Wyoming"],
        heroImage: images.northAmerica,
        destinations: [
          d(
            "new-york",
            "New York",
            "Suite stays, Broadway and private museum hours.",
            40.71,
            -74.01,
            ["April", "May", "September", "October"],
            ["city"],
            "New York",
          ),
          d(
            "napa-valley",
            "Napa Valley",
            "Estate tastings, culinary residencies and hot-air balloons.",
            38.5,
            -122.27,
            ["March", "April", "September", "October"],
            ["wine"],
            "California",
          ),
        ],
      },
    ],
  },
  {
    slug: "oceania",
    name: "Oceania",
    headline: "Oceania & the South Pacific",
    intro: "Reef and rainforest, Māori heritage and overwater villas at the edge of the map.",
    heroImage: images.oceania,
    countries: [
      {
        slug: "new-zealand",
        name: "New Zealand",
        code: "NZ",
        blurb: "Lodge culture, heli-access wilderness and Central Otago vineyards.",
        states: ["Otago", "Canterbury"],
        heroImage: images.oceania,
        destinations: [
          d(
            "queenstown",
            "Queenstown",
            "Heli-hiking, lakeside lodges and Pinot Noir country.",
            -45.03,
            168.66,
            ["November", "December", "February", "March"],
            ["lodges", "adventure"],
            "Otago",
          ),
        ],
      },
      {
        slug: "australia",
        name: "Australia",
        code: "AU",
        blurb: "Reef, red centre and city sophistication with premium domestic air.",
        states: ["Queensland", "Northern Territory", "New South Wales"],
        heroImage: images.oceania,
        destinations: [
          d(
            "great-barrier-reef",
            "Great Barrier Reef",
            "Private pontoon diving and island lodge stays.",
            -18.29,
            147.7,
            ["June", "July", "August", "September"],
            ["reef", "diving"],
            "Queensland",
          ),
        ],
      },
    ],
  },
];

export function allRegions(): RegionNode[] {
  return WORLD;
}

export function getRegion(slug: string): RegionNode | null {
  return WORLD.find((r) => r.slug === slug) ?? null;
}

export function getCountry(regionSlug: string, countrySlug: string): CountryNode | null {
  return getRegion(regionSlug)?.countries.find((c) => c.slug === countrySlug) ?? null;
}

export function getDestination(
  regionSlug: string,
  countrySlug: string,
  destSlug: string,
): DestinationNode | null {
  return getCountry(regionSlug, countrySlug)?.destinations.find((x) => x.slug === destSlug) ?? null;
}

export function countRegion(r: RegionNode) {
  const countries = r.countries.length;
  const destinations = r.countries.reduce((s, c) => s + c.destinations.length, 0);
  const journeys = filterJourneys({ region: r.slug }).length;
  return { countries, destinations, journeys };
}

export function journeysForRegion(slug: string, limit?: number): Journey[] {
  return filterJourneys({ region: slug }, limit);
}

export function journeysForCountry(slug: string, limit?: number): Journey[] {
  return filterJourneys({ country: slug }, limit);
}

export function journeysForDestination(slug: string, limit?: number): Journey[] {
  return filterJourneys({ destination: slug }, limit);
}

/** Catalogue products whose location/country matches a destination or country name. */
export function catalogueFor(names: string[], limit = 6): CatalogueProduct[] {
  const needles = names.map((n) => n.toLowerCase()).filter(Boolean);
  return catalogueIndex()
    .filter((p) => {
      const hay = `${p.location} ${p.country} ${p.region ?? ""} ${p.title}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    })
    .slice(0, limit);
}

export function relatedDestinations(regionSlug: string, exclude: string, limit = 6) {
  const region = getRegion(regionSlug);
  if (!region) return [] as { region: string; country: CountryNode; dest: DestinationNode }[];
  const out: { region: string; country: CountryNode; dest: DestinationNode }[] = [];
  for (const c of region.countries)
    for (const dest of c.destinations)
      if (dest.slug !== exclude) out.push({ region: region.slug, country: c, dest });
  return out.slice(0, limit);
}

export function mapEmbedUrl(lat: number, lng: number, span = 2.5): string {
  const bbox = [lng - span, lat - span / 2, lng + span, lat + span / 2]
    .map((n) => n.toFixed(4))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function destinationFaqs(name: string, months: string[]) {
  return [
    {
      q: `When is the best time to travel to ${name}?`,
      a: months.length
        ? `Our specialists recommend ${months.join(", ")} for the most reliable conditions and the strongest availability with our partner operators.`
        : `Conditions are favourable year-round; your specialist will advise on the best window for your dates.`,
    },
    {
      q: `How do I travel to ${name} with Worldway?`,
      a: `Every journey is arranged privately: premium-cabin flights, private transfers, vetted guides and 24/7 concierge support on the ground.`,
    },
    {
      q: `Can journeys in ${name} be tailored?`,
      a: `Yes. Every itinerary shown can be extended, shortened, privatised or combined with another destination. Request a quote and a specialist responds within 24 hours.`,
    },
  ];
}
