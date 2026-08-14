// Worldway-authored advisory reference content for the Crystal Cruises module.
// This is Worldway's own editorial copy plus publicly known factual geography;
// no supplier layout, marketing copy, imagery or pricing is reproduced here.
// Every commercial element (voyages, fares, availability, deck plans, brochure
// media) stays empty until an authorised Crystal feed is connected.
import type { CrystalDestination, CrystalPort, CrystalShip } from "./types";

export const CRYSTAL_SUPPLIER_ID = "crystal-cruises";

export const CRYSTAL_LICENCE_NOTICE =
  "Voyages, fares, suite availability and deck plans are published only from Crystal's authorised partner feed. Worldway does not reproduce supplier content. Until the commercial integration is activated, a Worldway cruise specialist confirms every itinerary and price directly with the line.";

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=80`;

export const CRYSTAL_HERO_IMAGE = img("photo-1548574505-5e239809ee19");

export const CRYSTAL_DESTINATIONS: CrystalDestination[] = [
  {
    slug: "mediterranean",
    name: "Mediterranean",
    region: "Europe",
    countries: ["Italy", "France", "Spain", "Croatia", "Malta"],
    overview:
      "Classic summer cruising between the Riviera, the Amalfi coast, the Adriatic and the Balearics, with short sea legs and long evenings in port.",
    bestTime: "May to October, with the calmest seas in June and September.",
    season: ["May", "June", "July", "August", "September", "October"],
    hero: img("photo-1516483638261-f4dbaf036963"),
    map: { lat: 41.9, lng: 12.5, zoomHint: "basin" },
    ports: ["monte-carlo", "civitavecchia", "barcelona", "dubrovnik", "valletta"],
    related: ["greek-islands", "northern-europe", "middle-east"],
    faqs: [
      {
        q: "How long is a typical Mediterranean voyage?",
        a: "Most run seven to fourteen nights; longer repositioning legs appear at the start and end of the season.",
      },
      {
        q: "Are shore experiences included?",
        a: "Inclusions vary by fare and are confirmed from the licensed feed before booking.",
      },
    ],
  },
  {
    slug: "northern-europe",
    name: "Northern Europe",
    region: "Europe",
    countries: ["United Kingdom", "Denmark", "Sweden", "Estonia", "Iceland"],
    overview:
      "Baltic capitals, the North Sea and the Atlantic islands under long northern daylight, pairing capital cities with remote coastline.",
    bestTime: "June to August for the longest days and mildest seas.",
    season: ["May", "June", "July", "August", "September"],
    hero: img("photo-1504280390367-361c6d9f38f4"),
    map: { lat: 58.5, lng: 12.0, zoomHint: "region" },
    ports: ["copenhagen", "stockholm", "tallinn", "reykjavik", "southampton"],
    related: ["norway", "mediterranean"],
    faqs: [
      {
        q: "Do Baltic voyages include overnights in port?",
        a: "Several itineraries hold overnight berths; the exact schedule comes from the licensed voyage feed.",
      },
    ],
  },
  {
    slug: "norway",
    name: "Norway & the Fjords",
    region: "Europe",
    countries: ["Norway"],
    overview:
      "Deep-water fjord navigation, Arctic Circle crossings and small working harbours between Bergen and the far north.",
    bestTime: "May to September; late summer for midnight sun in the north.",
    season: ["May", "June", "July", "August", "September"],
    hero: img("photo-1516483638261-f4dbaf036963"),
    map: { lat: 62.5, lng: 7.5, zoomHint: "coast" },
    ports: ["bergen", "geiranger", "tromso", "alesund"],
    related: ["northern-europe", "world-cruise"],
    faqs: [
      {
        q: "Is the midnight sun guaranteed?",
        a: "North of the Arctic Circle between late May and mid-July, yes — weather permitting.",
      },
    ],
  },
  {
    slug: "greek-islands",
    name: "Greek Islands",
    region: "Europe",
    countries: ["Greece", "Turkey"],
    overview:
      "Cyclades and Dodecanese island-hopping with short overnight passages and archaeological shore days.",
    bestTime: "April to October, quietest in May and late September.",
    season: ["April", "May", "June", "July", "September", "October"],
    hero: img("photo-1533105079780-92b9be482077"),
    map: { lat: 37.4, lng: 25.3, zoomHint: "archipelago" },
    ports: ["piraeus", "santorini", "mykonos", "rhodes", "kusadasi"],
    related: ["mediterranean", "middle-east"],
    faqs: [
      {
        q: "Which port serves Athens?",
        a: "Piraeus, roughly forty minutes from the city centre by private transfer.",
      },
    ],
  },
  {
    slug: "caribbean",
    name: "Caribbean",
    region: "Americas",
    countries: ["Barbados", "St Lucia", "Antigua", "British Virgin Islands"],
    overview:
      "Windward and Leeward island cruising in warm winter waters, built around beach days, sailing and reef anchorages.",
    bestTime: "November to April, outside the hurricane season.",
    season: ["November", "December", "January", "February", "March", "April"],
    hero: img("photo-1507525428034-b723cf961d3e"),
    map: { lat: 15.3, lng: -61.4, zoomHint: "archipelago" },
    ports: ["bridgetown", "castries", "st-johns", "tortola"],
    related: ["south-america", "world-cruise"],
    faqs: [
      {
        q: "When is hurricane season?",
        a: "June to November; luxury programmes concentrate on the dry winter months.",
      },
    ],
  },
  {
    slug: "alaska",
    name: "Alaska",
    region: "Americas",
    countries: ["United States", "Canada"],
    overview:
      "Inside Passage navigation, tidewater glaciers and Gold Rush ports between Vancouver and the Gulf of Alaska.",
    bestTime: "May to September, with peak wildlife in July and August.",
    season: ["May", "June", "July", "August", "September"],
    hero: img("photo-1518156677180-95a2893f3e9f"),
    map: { lat: 58.3, lng: -134.4, zoomHint: "coast" },
    ports: ["vancouver", "juneau", "skagway", "seward", "ketchikan"],
    related: ["world-cruise", "northern-europe"],
    faqs: [
      {
        q: "Do voyages enter Glacier Bay?",
        a: "Access is permit-controlled; confirmed entries appear on the licensed itinerary record.",
      },
    ],
  },
  {
    slug: "south-pacific",
    name: "South Pacific",
    region: "Oceania",
    countries: ["French Polynesia", "Fiji", "Cook Islands"],
    overview:
      "Long ocean passages between remote atolls, lagoons and volcanic islands, usually as part of extended programmes.",
    bestTime: "May to October, the drier trade-wind season.",
    season: ["May", "June", "July", "August", "September", "October"],
    hero: img("photo-1505228395891-9a51e7e86bf6"),
    map: { lat: -17.6, lng: -149.4, zoomHint: "ocean" },
    ports: ["papeete", "bora-bora", "suva", "rarotonga"],
    related: ["australia", "new-zealand", "world-cruise"],
    faqs: [
      {
        q: "Are these voyages sold separately?",
        a: "Some sectors sell as standalone legs of a grand voyage; availability depends on the line's segment policy.",
      },
    ],
  },
  {
    slug: "asia",
    name: "Asia",
    region: "Asia",
    countries: ["Singapore", "Vietnam", "Thailand", "South Korea"],
    overview:
      "Southeast and East Asian coastlines linking city ports, temple towns and river deltas across a long shoulder season.",
    bestTime: "November to March for the driest conditions.",
    season: ["November", "December", "January", "February", "March", "April"],
    hero: img("photo-1528181304800-259b08848526"),
    map: { lat: 10.8, lng: 106.6, zoomHint: "region" },
    ports: ["singapore", "ho-chi-minh-city", "laem-chabang", "busan"],
    related: ["japan", "middle-east", "world-cruise"],
    faqs: [
      {
        q: "Can Asia sectors combine with Japan?",
        a: "Yes — spring and autumn repositioning legs frequently link the two regions.",
      },
    ],
  },
  {
    slug: "japan",
    name: "Japan",
    region: "Asia",
    countries: ["Japan"],
    overview:
      "Honshu, Kyushu and Hokkaido coastal calls timed to cherry blossom in spring and maple colour in autumn.",
    bestTime: "Late March to April, and October to November.",
    season: ["March", "April", "May", "October", "November"],
    hero: img("photo-1490806843957-31f4c9a91c65"),
    map: { lat: 35.4, lng: 139.6, zoomHint: "coast" },
    ports: ["yokohama", "kobe", "nagasaki", "hakodate"],
    related: ["asia", "world-cruise"],
    faqs: [
      {
        q: "Do blossom voyages sell out early?",
        a: "Spring sailings are the first to close; we hold advisor waitlists once the feed is live.",
      },
    ],
  },
  {
    slug: "australia",
    name: "Australia",
    region: "Oceania",
    countries: ["Australia"],
    overview:
      "Coastal circumnavigation legs from Sydney and Fremantle taking in the Great Barrier Reef and Tasmania.",
    bestTime: "November to March in the south; May to September for the tropical north.",
    season: ["November", "December", "January", "February", "March"],
    hero: img("photo-1523482580672-f109ba8cb9be"),
    map: { lat: -33.8, lng: 151.2, zoomHint: "coast" },
    ports: ["sydney", "cairns", "hobart", "fremantle"],
    related: ["new-zealand", "south-pacific"],
    faqs: [
      {
        q: "Are reef days weather-dependent?",
        a: "Yes; tender operations at reef anchorages are always at the master's discretion.",
      },
    ],
  },
  {
    slug: "new-zealand",
    name: "New Zealand",
    region: "Oceania",
    countries: ["New Zealand"],
    overview:
      "Fiordland scenic cruising, South Island wine ports and the Bay of Islands, usually paired with Australian sectors.",
    bestTime: "December to March.",
    season: ["November", "December", "January", "February", "March"],
    hero: img("photo-1507699622108-4be3abd695ad"),
    map: { lat: -44.6, lng: 167.9, zoomHint: "coast" },
    ports: ["auckland", "wellington", "akaroa", "dunedin"],
    related: ["australia", "south-pacific"],
    faqs: [
      {
        q: "Is Milford Sound included?",
        a: "Fiordland scenic cruising is itinerary-specific and confirmed from the licensed voyage record.",
      },
    ],
  },
  {
    slug: "middle-east",
    name: "Middle East",
    region: "Middle East",
    countries: ["United Arab Emirates", "Oman", "Jordan"],
    overview:
      "Arabian Gulf and Red Sea itineraries linking modern harbour cities with desert and archaeological interiors.",
    bestTime: "November to March.",
    season: ["November", "December", "January", "February", "March"],
    hero: img("photo-1512453979798-5ea266f8880c"),
    map: { lat: 25.2, lng: 55.3, zoomHint: "region" },
    ports: ["dubai", "muscat", "aqaba", "abu-dhabi"],
    related: ["asia", "africa", "mediterranean"],
    faqs: [
      {
        q: "Are canal transits included?",
        a: "Suez transits appear on repositioning voyages; the licensed itinerary confirms the routing.",
      },
    ],
  },
  {
    slug: "africa",
    name: "Africa",
    region: "Africa",
    countries: ["South Africa", "Namibia", "Morocco", "Seychelles"],
    overview:
      "Atlantic and Indian Ocean coastlines with safari and wine-country extensions ashore.",
    bestTime: "October to April on the southern coast.",
    season: ["October", "November", "December", "January", "February", "March", "April"],
    hero: img("photo-1516426122078-c23e76319801"),
    map: { lat: -33.9, lng: 18.4, zoomHint: "coast" },
    ports: ["cape-town", "walvis-bay", "casablanca", "victoria"],
    related: ["middle-east", "south-america", "world-cruise"],
    faqs: [
      {
        q: "Can safari extensions be added?",
        a: "Yes — Worldway arranges pre- and post-cruise safari through our existing licensed operators.",
      },
    ],
  },
  {
    slug: "south-america",
    name: "South America",
    region: "Americas",
    countries: ["Brazil", "Argentina", "Chile", "Peru"],
    overview:
      "Atlantic capitals, Patagonian channels and Cape Horn rounding, with Amazon and Andes extensions ashore.",
    bestTime: "November to March for the far south.",
    season: ["November", "December", "January", "February", "March"],
    hero: img("photo-1483729558449-99ef09a8c325"),
    map: { lat: -33.4, lng: -70.6, zoomHint: "continent" },
    ports: ["buenos-aires", "ushuaia", "valparaiso", "rio-de-janeiro"],
    related: ["caribbean", "world-cruise", "africa"],
    faqs: [
      {
        q: "Do voyages round Cape Horn?",
        a: "Southbound Patagonia sectors typically do, sea state permitting.",
      },
    ],
  },
  {
    slug: "north-america",
    name: "North America",
    region: "North America",
    countries: ["United States", "Canada"],
    overview:
      "Atlantic seaboard, the St Lawrence and the Pacific coast: Boston and New York in the fall, Quebec and Montreal through the maple season, San Diego for winter repositioning.",
    bestTime: "May to October on the Atlantic side; November to March out of San Diego.",
    season: ["May", "June", "July", "August", "September", "October"],
    hero: img("photo-1502920917128-1aa500764cbd"),
    map: { lat: 45.0, lng: -73.5, zoomHint: "region" },
    ports: ["new-york", "boston", "montreal", "quebec-city", "san-diego"],
    related: ["alaska", "caribbean", "world-cruise"],
    faqs: [
      {
        q: "Which season suits Canada and New England?",
        a: "Late September and October for the colour; earlier summer sailings trade foliage for warmer port days.",
      },
      {
        q: "Are pre-cruise stays arranged?",
        a: "Yes — hotels, transfers and flights sit on the same Worldway booking record as the voyage.",
      },
    ],
  },
  {
    slug: "world-cruise",
    name: "World Cruise",
    region: "Global",
    countries: ["Multiple"],
    overview:
      "The full circumnavigation and its named grand-voyage sectors, sold whole or in segments where the line permits.",
    bestTime: "January departures, running three to four months.",
    season: ["January", "February", "March", "April"],
    hero: img("photo-1520250497591-112f2f40a3f4"),
    map: { lat: 0, lng: 0, zoomHint: "global" },
    ports: ["los-angeles", "sydney", "cape-town", "civitavecchia"],
    related: ["south-pacific", "africa", "asia"],
    faqs: [
      {
        q: "Can segments be booked individually?",
        a: "Segment policy is set by the line each season and confirmed from the licensed feed.",
      },
      {
        q: "When do world cruises open for sale?",
        a: "Typically eighteen months ahead, with priority for past guests and members.",
      },
    ],
  },
];

const PORT_SEED: Omit<CrystalPort, "summary">[] = CRYSTAL_DESTINATIONS.flatMap((d) =>
  d.ports.map((p) => ({
    slug: p,
    name: p
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    country: d.countries[0] ?? d.name,
    destinationSlug: d.slug,
  })),
);

export const CRYSTAL_PORTS: CrystalPort[] = PORT_SEED.filter(
  (p, i, arr) => arr.findIndex((x) => x.slug === p.slug) === i,
).map((p) => ({
  ...p,
  summary: `${p.name} is a scheduled call within Worldway's ${p.destinationSlug.replace(/-/g, " ")} cruise programme. Berth, tender arrangements and shore experiences are confirmed from the licensed voyage record.`,
}));

export function portBySlug(slug: string): CrystalPort | null {
  return CRYSTAL_PORTS.find((p) => p.slug === slug) ?? null;
}

export function destinationBySlug(slug: string): CrystalDestination | null {
  return CRYSTAL_DESTINATIONS.find((d) => d.slug === slug) ?? null;
}

const SHARED_SUITES = (prefix: string) => [
  {
    id: `${prefix}-ov`,
    name: "Ocean View Suite",
    category: "ocean-view" as const,
    description:
      "Sea-facing accommodation with a picture window, sitting area and butler-supported service.",
  },
  {
    id: `${prefix}-bal`,
    name: "Veranda Suite",
    category: "balcony" as const,
    description: "Private veranda, separate lounge seating and walk-in wardrobe.",
  },
  {
    id: `${prefix}-pent`,
    name: "Penthouse Suite",
    category: "penthouse" as const,
    description: "Extended living space, dining area and enhanced butler service.",
  },
  {
    id: `${prefix}-res`,
    name: "Owner's Residence",
    category: "residence" as const,
    description:
      "Top-deck residence with multiple rooms, private dining and the highest service ratio on board.",
  },
];

export const CRYSTAL_SHIPS: CrystalShip[] = [
  {
    slug: "crystal-serenity",
    name: "Crystal Serenity",
    classification: "Luxury ocean vessel",
    overview:
      "The larger of the two ocean ships in the programme, used for long-range itineraries and world-cruise sectors. Worldway advisors brief clients on layout, service ratio and dining rhythm before booking.",
    hero: img("photo-1548574505-5e239809ee19"),
    gallery: [img("photo-1544551763-46a013bb70d5"), img("photo-1507525428034-b723cf961d3e")],
    specs: [
      { label: "Configuration", value: "All-suite, ocean" },
      { label: "Service style", value: "Butler-supported, all-inclusive" },
      { label: "Detailed specification", value: "Published from the licensed data feed" },
    ],
    decks: [
      { name: "Accommodation decks", summary: "Suite grades from ocean view to residence." },
      { name: "Public decks", summary: "Restaurants, lounges, boutiques and the theatre." },
      { name: "Wellness deck", summary: "Spa, salon, fitness studio and pool terrace." },
    ],
    suites: SHARED_SUITES("ser"),
    dining: [
      "Main dining room with open seating",
      "Speciality restaurants (reservation-based)",
      "Casual all-day dining and in-suite service",
    ],
    lounges: ["Observation lounge", "Piano and cocktail bars", "Cigar and whisky lounge"],
    wellness: ["Spa and treatment suites", "Salon", "Fitness studio", "Pool and sun terrace"],
    enrichment: ["Guest lecturers", "Culinary and wine sessions", "Live performance programme"],
    accessibility: [
      "Accessible suites available on request",
      "Lift access across guest decks",
      "Mobility equipment arranged by your advisor",
    ],
    sustainability: [
      "Single-use plastic reduction programme",
      "Advanced waste-water treatment",
      "Shore-power capability where ports support it",
    ],
    faqs: [
      {
        q: "Are deck plans available?",
        a: "Deck plans publish automatically once Crystal's licensed asset feed is connected.",
      },
      {
        q: "Is gratuity included?",
        a: "Fare inclusions are confirmed per voyage from the licensed fare record.",
      },
    ],
  },
  {
    slug: "crystal-symphony",
    name: "Crystal Symphony",
    classification: "Luxury ocean vessel",
    overview:
      "The more intimate ocean ship, favoured for Mediterranean, Northern Europe and Caribbean seasons where smaller harbours matter.",
    hero: img("photo-1507525428034-b723cf961d3e"),
    gallery: [img("photo-1548574505-5e239809ee19"), img("photo-1544551763-46a013bb70d5")],
    specs: [
      { label: "Configuration", value: "All-suite, ocean" },
      { label: "Service style", value: "Butler-supported, all-inclusive" },
      { label: "Detailed specification", value: "Published from the licensed data feed" },
    ],
    decks: [
      { name: "Accommodation decks", summary: "Suite grades from ocean view to residence." },
      { name: "Public decks", summary: "Dining, lounges, boutiques and enrichment spaces." },
      { name: "Wellness deck", summary: "Spa, fitness and pool terrace." },
    ],
    suites: SHARED_SUITES("sym"),
    dining: [
      "Main dining room with open seating",
      "Speciality restaurants (reservation-based)",
      "Casual all-day dining and in-suite service",
    ],
    lounges: ["Observation lounge", "Cocktail and wine bars", "Nightclub"],
    wellness: ["Spa and treatment suites", "Salon", "Fitness studio", "Pool terrace"],
    enrichment: ["Destination lectures", "Wine and culinary programme", "Live music"],
    accessibility: [
      "Accessible suites available on request",
      "Lift access across guest decks",
      "Tender assistance arranged in advance",
    ],
    sustainability: [
      "Fuel-efficiency monitoring",
      "Waste segregation and recycling",
      "Responsible sourcing programme",
    ],
    faqs: [
      {
        q: "Which itineraries use Symphony?",
        a: "Seasonal deployment publishes with the licensed voyage calendar.",
      },
    ],
  },
  {
    slug: "crystal-grace",
    name: "Crystal Grace",
    classification: "Luxury ocean vessel",
    overview:
      "The newest ship in the Crystal programme, purpose-built for all-suite luxury cruising with expanded wellness and dining space. Worldway advisors brief clients on suite grades and seasonal deployment before booking.",
    hero: img("photo-1544551763-46a013bb70d5"),
    gallery: [img("photo-1548574505-5e239809ee19"), img("photo-1507525428034-b723cf961d3e")],
    specs: [
      { label: "Configuration", value: "All-suite, ocean" },
      { label: "Service style", value: "Butler-supported, all-inclusive" },
      { label: "Detailed specification", value: "Published from the licensed data feed" },
    ],
    decks: [
      { name: "Accommodation decks", summary: "Suite grades from ocean view to penthouse." },
      { name: "Public decks", summary: "Restaurants, lounges, boutiques and enrichment spaces." },
      { name: "Wellness deck", summary: "Spa, fitness studio, salon and pool terrace." },
    ],
    suites: SHARED_SUITES("gra"),
    dining: [
      "Main dining room with open seating",
      "Speciality restaurants (reservation-based)",
      "Casual all-day dining and in-suite service",
    ],
    lounges: ["Observation lounge", "Cocktail and wine bars", "Cigar lounge"],
    wellness: ["Spa and treatment suites", "Salon", "Fitness studio", "Pool terrace"],
    enrichment: ["Destination lectures", "Culinary and wine programme", "Live performance"],
    accessibility: [
      "Accessible suites available on request",
      "Lift access across guest decks",
      "Tender assistance arranged in advance",
    ],
    sustainability: [
      "Latest-generation fuel efficiency systems",
      "Advanced waste-water treatment",
      "Single-use plastic reduction programme",
    ],
    faqs: [
      {
        q: "Where does Crystal Grace sail?",
        a: "Seasonal deployment publishes live with the voyage calendar on this page.",
      },
    ],
  },
];

export function shipBySlug(slug: string): CrystalShip | null {
  return CRYSTAL_SHIPS.find((s) => s.slug === slug) ?? null;
}

export const WHY_CRYSTAL = [
  {
    title: "All-inclusive by design",
    body: "Dining, beverages, gratuities and most on-board service sit inside the fare, so the on-board account stays quiet.",
  },
  {
    title: "Space and service ratio",
    body: "All-suite accommodation with butler-supported service and one of the highest crew-to-guest ratios at sea.",
  },
  {
    title: "Serious itineraries",
    body: "Long port stays, overnight berths and full circumnavigation programmes rather than short shuttle loops.",
  },
  {
    title: "One Worldway file",
    body: "Flights, transfers, pre- and post-cruise hotels, insurance and visas are arranged on the same booking record.",
  },
];

export const MEMBERSHIP_BENEFITS = [
  "Priority waitlist placement when a sailing closes",
  "Worldway wallet credit applied against deposits and instalments",
  "Complimentary private transfers on qualifying suite grades",
  "Dedicated cruise specialist from enquiry through disembarkation",
  "Pre- and post-cruise hotel programme at negotiated rates",
];

export const CRYSTAL_FAQS = [
  {
    q: "Why can I not see live prices yet?",
    a: "Worldway only publishes cruise pricing that arrives through an authorised distribution channel. Until Crystal's partner integration is activated for this account, a specialist quotes each voyage directly.",
  },
  {
    q: "Can I still book a Crystal voyage today?",
    a: "Yes. Submit a quote request or speak to an advisor — we place the reservation through Crystal's authorised advisor channel and manage it on your Worldway booking record.",
  },
  {
    q: "What happens when the feed goes live?",
    a: "Voyages, itineraries, suite availability, fares and promotions appear automatically across the hub, search engine, destination and ship pages — no rebuild required.",
  },
  {
    q: "How are deposits and instalments handled?",
    a: "Through the existing Worldway booking engine: wallet, card and instalment plans, with documents issued to your account.",
  },
  {
    q: "Do you copy content from the cruise line?",
    a: "No. All reference material here is written by Worldway. Supplier imagery, copy and deck plans render only from licensed assets.",
  },
];

export const CONCIERGE_PROMPTS = [
  "I want a Mediterranean cruise in September.",
  "Show luxury cruises under 14 nights.",
  "I want a balcony suite.",
  "I want to visit Japan and South Korea.",
  "I want a world cruise.",
];
