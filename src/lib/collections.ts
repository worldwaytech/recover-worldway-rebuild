// WorldwayLuxe — Collections catalogue
// Unified data model powering every category vertical (cruises, rail,
// aviation, tours, safari, polar, cultural, honeymoon, wellness, family,
// hotels, villas, yachts, flights, activities, transfers, insurance, visa,
// membership tiers). Every page consumes this file through shared templates.
//
// TODO(Lovable Cloud): move to Supabase tables (collections, collection_items,
// itineraries, pricing_tiers, media_gallery) with RLS-scoped reads.

import { images } from "./data-images";

export type CollectionKind =
  | "cruises"
  | "cruises-expedition"
  | "cruises-river"
  | "cruises-world"
  | "rail"
  | "aviation"
  | "tours"
  | "small-group"
  | "tailor-made"
  | "safari"
  | "polar"
  | "cultural"
  | "honeymoon"
  | "wellness"
  | "family"
  | "flights"
  | "hotels"
  | "activities"
  | "transfers"
  | "villas"
  | "yachts"
  | "insurance"
  | "visa";

export interface CollectionItem {
  slug: string;
  title: string;
  subtitle: string;
  location: string;
  region?: string;
  image: string;
  priceFrom?: number;
  priceUnit?: string;
  duration?: string;
  capacity?: string;
  operator?: string;
  highlights: string[];
  inclusions?: string[];
  tags?: string[];
  featured?: boolean;
}

export interface CollectionMeta {
  slug: CollectionKind;
  title: string;
  eyebrow: string;
  headline: string;
  intro: string;
  heroImage: string;
  breadcrumbParent?: { label: string; to: string };
  benefits: { title: string; text: string }[];
  faqs: { q: string; a: string }[];
  itemNoun: string;
  itemNounPlural: string;
  detailBasePath: string;
}

export const formatMoney = (n?: number, unit = "per guest") =>
  n == null
    ? "On request"
    : `From ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)} ${unit}`;

// --- COLLECTION METADATA ---
export const collectionsMeta: Record<CollectionKind, CollectionMeta> = {
  cruises: {
    slug: "cruises",
    title: "Luxury Cruises",
    eyebrow: "All-inclusive at sea",
    headline: "Luxury Cruises",
    intro:
      "All-suite ships, Michelin-caliber dining and immersive shore programmes with the world's most celebrated cruise lines — Silversea, Regent Seven Seas, Seabourn, Explora Journeys and Ritz-Carlton Yacht Collection.",
    heroImage: images.cruise,
    benefits: [
      { title: "All-suite fleet", text: "Every voyage aboard suite-only ships with butler service." },
      { title: "Curated shore programmes", text: "Private access excursions unavailable to independent travellers." },
      { title: "All-inclusive", text: "Flights, transfers, gratuities, premium beverages and shore excursions included." },
    ],
    faqs: [
      { q: "What is included?", a: "Ocean-view suite, all meals, unlimited fine wines & spirits, gratuities, business-class flights on select fares and curated shore excursions." },
      { q: "Are single travellers welcome?", a: "Yes — selected departures waive or reduce the single supplement. Ask your specialist." },
    ],
    itemNoun: "voyage",
    itemNounPlural: "voyages",
    detailBasePath: "/cruises",
  },
  "cruises-expedition": {
    slug: "cruises-expedition",
    title: "Expedition Cruises",
    eyebrow: "Explorer voyages",
    headline: "Expedition Cruises",
    intro:
      "Small-ship expedition voyages to the wildest edges of the planet — Antarctica, the Arctic, the Galápagos, Amazon, Kimberley and remote Pacific islands — with naturalists, ice-strengthened hulls and Zodiac fleets.",
    heroImage: images.polar,
    breadcrumbParent: { label: "Cruises", to: "/cruises" },
    benefits: [
      { title: "Expert expedition teams", text: "Ornithologists, marine biologists, glaciologists and polar historians onboard." },
      { title: "Ice-class ships", text: "Purpose-built expedition vessels with polar-class hulls and Zodiac fleets." },
      { title: "Small-group landings", text: "Under 200 guests total, so every landing feels intimate." },
    ],
    faqs: [
      { q: "Do I need to be physically fit?", a: "Zodiac boardings involve short steps; most guests aged 8–85 join without difficulty." },
      { q: "What about seasickness?", a: "Modern stabilisers and thoughtful routing minimise it; onboard medical teams support anyone who needs it." },
    ],
    itemNoun: "expedition",
    itemNounPlural: "expeditions",
    detailBasePath: "/expedition-cruises",
  },
  "cruises-river": {
    slug: "cruises-river",
    title: "River Cruises",
    eyebrow: "Waterways of the world",
    headline: "River Cruises",
    intro:
      "Boutique river cruising along the Danube, Rhine, Douro, Seine, Mekong, Nile and Amazon — small ships, all-suite comfort and immersive port-town access.",
    heroImage: images.europe,
    breadcrumbParent: { label: "Cruises", to: "/cruises" },
    benefits: [
      { title: "All-suite riverboats", text: "Panoramic balconies and butler service on every voyage." },
      { title: "City-centre moorings", text: "Step off into historic town centres with no coach transfers." },
      { title: "Curated excursions", text: "Included cultural, culinary and active experiences daily." },
    ],
    faqs: [
      { q: "How many guests onboard?", a: "Between 100 and 200 guests on most river vessels — small, personal, refined." },
    ],
    itemNoun: "river voyage",
    itemNounPlural: "river voyages",
    detailBasePath: "/river-cruises",
  },
  "cruises-world": {
    slug: "cruises-world",
    title: "World Cruises",
    eyebrow: "Circumnavigation",
    headline: "World Cruises",
    intro:
      "The ultimate maritime journey — months at sea, dozens of countries and continents linked in a single seamless voyage aboard the world's most exclusive ships.",
    heroImage: images.hero,
    breadcrumbParent: { label: "Cruises", to: "/cruises" },
    benefits: [
      { title: "One suite, many worlds", text: "Unpack once and see continents roll past your veranda." },
      { title: "Exclusive world-cruise privileges", text: "Onboard credits, laundry, business-class flights and complimentary land programmes." },
      { title: "Fellow global travellers", text: "Join a community of world-cruise regulars for months of shared discovery." },
    ],
    faqs: [
      { q: "Can I join for part of the voyage?", a: "Yes — most world cruises are sold as segments of 20–60 nights." },
    ],
    itemNoun: "world voyage",
    itemNounPlural: "world voyages",
    detailBasePath: "/world-cruises",
  },
  rail: {
    slug: "rail",
    title: "Luxury Rail Journeys",
    eyebrow: "Grand rail voyages",
    headline: "Luxury Rail Journeys",
    intro:
      "The romance of the golden age of rail, reimagined — Belmond's Venice Simplon-Orient-Express, Royal Scotsman, Rocky Mountaineer, Rovos Rail, Maharajas' Express and Japan's Seven Stars in Kyushu.",
    heroImage: images.europe,
    benefits: [
      { title: "Suite cabins", text: "Private ensuite cabins with panoramic windows and butler service." },
      { title: "Michelin-inspired dining", text: "Multi-course tasting menus paired with fine wines each evening." },
      { title: "Curated off-train excursions", text: "Private access at every stop — castles, wineries, safari camps." },
    ],
    faqs: [
      { q: "What is the dress code?", a: "Elegant daywear; jacket & tie or gown for dinner on select trains." },
    ],
    itemNoun: "rail journey",
    itemNounPlural: "rail journeys",
    detailBasePath: "/rail",
  },
  aviation: {
    slug: "aviation",
    title: "Private Aviation",
    eyebrow: "Wheels-up privacy",
    headline: "Private Aviation",
    intro:
      "Private jet charter, empty-leg intelligence, jet card programmes and fully chartered private-jet expeditions circumnavigating the globe with expert-led touring at every stop.",
    heroImage: images.jet,
    benefits: [
      { title: "Global charter access", text: "Light jets to VIP-configured widebodies, dispatched worldwide within hours." },
      { title: "Jet expeditions", text: "Fully chartered 48–88 seat aircraft on curated 20–24 day itineraries." },
      { title: "Discreet handling", text: "Private FBO terminals, chauffeur airside and total confidentiality." },
    ],
    faqs: [
      { q: "How much notice do you need?", a: "Empty legs from 6 hours; fully bespoke charters typically 48–72 hours." },
    ],
    itemNoun: "aviation programme",
    itemNounPlural: "aviation programmes",
    detailBasePath: "/private-aviation",
  },
  tours: {
    slug: "tours",
    title: "Ultra-Luxury Tours",
    eyebrow: "Signature itineraries",
    headline: "Ultra-Luxury Tours",
    intro:
      "Fully hosted, ultra-luxury small-group and private tours across every continent — pillar itineraries curated by the world's most storied tour operators.",
    heroImage: images.hero,
    benefits: [
      { title: "Hosted throughout", text: "A dedicated tour director accompanies every itinerary." },
      { title: "Marquee properties", text: "Aman, Rosewood, Belmond, Four Seasons and Oberoi at every stop." },
      { title: "Private access", text: "After-hours museum visits, resident-only experiences and specialist guides." },
    ],
    faqs: [{ q: "Are these tours flexible?", a: "Group departures follow a set itinerary; private editions of every tour can be tailored." }],
    itemNoun: "tour",
    itemNounPlural: "tours",
    detailBasePath: "/tours",
  },
  "small-group": {
    slug: "small-group",
    title: "Small Group Journeys",
    eyebrow: "Under 24 guests",
    headline: "Small Group Journeys",
    intro:
      "Intimate departures with fewer than 24 guests — the camaraderie of a private group, the seamless logistics of a professionally hosted programme.",
    heroImage: images.smallGroup,
    benefits: [
      { title: "Maximum 24 guests", text: "Every departure hosted, every itinerary intimate." },
      { title: "Set departure dates", text: "Confirmed dates, reserved rooms, guaranteed inclusions." },
      { title: "Solo-friendly", text: "Reduced or waived single supplements on selected departures." },
    ],
    faqs: [{ q: "Who joins these tours?", a: "Culturally curious travellers 45+ from around the world; couples, singles and friends travelling together." }],
    itemNoun: "small-group departure",
    itemNounPlural: "small-group departures",
    detailBasePath: "/small-group",
  },
  "tailor-made": {
    slug: "tailor-made",
    title: "Private Tailor-Made Journeys",
    eyebrow: "Written for you",
    headline: "Tailor-Made Journeys",
    intro:
      "Every element crafted around you — your interests, your travel companions, your pace. Speak with a specialist and receive a bespoke itinerary within 72 hours.",
    heroImage: images.asia,
    benefits: [
      { title: "A dedicated specialist", text: "One senior planner from concept to farewell." },
      { title: "Total flexibility", text: "Choose your date, your pace, your properties, your guides." },
      { title: "Concierge on the ground", text: "24/7 in-country support anywhere in the world." },
    ],
    faqs: [
      { q: "How long does the process take?", a: "A first proposal within 72 hours; most journeys refined over 2–3 iterations." },
    ],
    itemNoun: "tailor-made experience",
    itemNounPlural: "tailor-made experiences",
    detailBasePath: "/tailor-made",
  },
  safari: {
    slug: "safari",
    title: "Safari Experiences",
    eyebrow: "The wild in luxury",
    headline: "Safari Experiences",
    intro:
      "Africa's most storied private conservancies and mobile camps — the Great Migration, mountain gorillas, Okavango water safaris and Cape Winelands, hosted by A&K's master guides.",
    heroImage: images.africa,
    benefits: [
      { title: "Master private guides", text: "Silver-level guides accompany you throughout — a rare distinction." },
      { title: "Exclusive-use camps", text: "Private mobile camps positioned along migration routes." },
      { title: "Charter flights", text: "Bush flights connect every camp — no long drives." },
    ],
    faqs: [
      { q: "Are children welcome?", a: "Most lodges accept children 8+; family-specific safaris available for younger guests." },
    ],
    itemNoun: "safari",
    itemNounPlural: "safaris",
    detailBasePath: "/safari",
  },
  polar: {
    slug: "polar",
    title: "Polar Expeditions",
    eyebrow: "Ends of the Earth",
    headline: "Polar Expeditions",
    intro:
      "Antarctica, the Arctic, Svalbard and Greenland aboard purpose-built expedition ships — polar bears, penguin colonies, icebergs and silence.",
    heroImage: images.polar,
    benefits: [
      { title: "Polar-class vessels", text: "PC5 & PC6 rated ships built for genuine ice cruising." },
      { title: "Fly-cruise options", text: "Skip the Drake Passage with air transfers to King George Island." },
      { title: "Onboard experts", text: "Naturalists, glaciologists, polar historians and photographers." },
    ],
    faqs: [
      { q: "When is the best time?", a: "November–March for Antarctica; May–September for the Arctic." },
    ],
    itemNoun: "polar expedition",
    itemNounPlural: "polar expeditions",
    detailBasePath: "/polar-expeditions",
  },
  cultural: {
    slug: "cultural",
    title: "Cultural & Heritage Tours",
    eyebrow: "Living history",
    headline: "Cultural & Heritage Tours",
    intro:
      "Private access to the world's living history — after-hours at the Vatican, private curators at the Louvre, master craftsmen in Kyoto and royal palaces in Rajasthan.",
    heroImage: images.asia,
    benefits: [
      { title: "After-hours access", text: "Private-only openings of the world's most visited monuments." },
      { title: "Scholar guides", text: "Art historians, archaeologists and cultural specialists throughout." },
      { title: "Heritage properties", text: "Palaces, riads, haveli and historic hotels selected for authenticity." },
    ],
    faqs: [{ q: "Are these tours physically demanding?", a: "Most are gentle; we can pace itineraries to your preference." }],
    itemNoun: "cultural journey",
    itemNounPlural: "cultural journeys",
    detailBasePath: "/cultural",
  },
  honeymoon: {
    slug: "honeymoon",
    title: "Honeymoon & Celebration Travel",
    eyebrow: "For life's milestones",
    headline: "Honeymoon & Celebrations",
    intro:
      "Overwater villas, private-island charters and grand-anniversary journeys — intimate escapes crafted for the moments that matter most.",
    heroImage: images.middleEast,
    benefits: [
      { title: "Romantic privacy", text: "Overwater villas, private plunge pools and exclusive-use retreats." },
      { title: "Signature moments", text: "Private beach dining, helicopter proposals and vow-renewal ceremonies." },
      { title: "Honeymoon amenities", text: "Complimentary upgrades, champagne, spa credits and celebration turndowns." },
    ],
    faqs: [{ q: "Do you plan proposals?", a: "Yes — from Petra sunrise to Bora Bora sunset, our concierges orchestrate the moment." }],
    itemNoun: "honeymoon",
    itemNounPlural: "honeymoons",
    detailBasePath: "/honeymoon",
  },
  wellness: {
    slug: "wellness",
    title: "Wellness & Retreats",
    eyebrow: "Rest, reset, restore",
    headline: "Wellness & Retreats",
    intro:
      "Ayurvedic sanctuaries, alpine wellness clinics, oceanfront yoga retreats and immersive detox programmes at the world's most acclaimed wellness estates.",
    heroImage: images.asia,
    benefits: [
      { title: "Medically supervised", text: "Full diagnostics and physician-led programmes at leading clinics." },
      { title: "Master practitioners", text: "Ayurvedic doctors, breath-work masters and integrative therapists." },
      { title: "Nourishing cuisine", text: "Chef-crafted, seasonal menus aligned to your programme." },
    ],
    faqs: [{ q: "How long should I stay?", a: "Meaningful transformation typically requires 7–14 nights." }],
    itemNoun: "wellness retreat",
    itemNounPlural: "wellness retreats",
    detailBasePath: "/wellness",
  },
  family: {
    slug: "family",
    title: "Family Luxury Travel",
    eyebrow: "Multi-generational",
    headline: "Family Luxury Travel",
    intro:
      "Journeys designed for every generation — from safaris built for young explorers to grand European tours that inspire teenage curiosity.",
    heroImage: images.southAmerica,
    benefits: [
      { title: "Kid-approved, adult-refined", text: "Programmes engaging for every age, without compromising luxury." },
      { title: "Interconnecting suites", text: "Family-suite guarantees at hand-picked properties." },
      { title: "Certified family guides", text: "Guides trained to work with children and multi-generational groups." },
    ],
    faqs: [{ q: "Are baby cots and menus available?", a: "Yes — every property is briefed on infant, toddler and teen requirements." }],
    itemNoun: "family journey",
    itemNounPlural: "family journeys",
    detailBasePath: "/family",
  },
  flights: {
    slug: "flights",
    title: "First & Business Class Flights",
    eyebrow: "Airborne luxury",
    headline: "Flights",
    intro:
      "First-class and business-class airfare on the world's leading carriers — Emirates, Etihad, Singapore Airlines, Qatar, ANA and Cathay — with fare-brokered pricing unavailable direct.",
    heroImage: images.jet,
    benefits: [
      { title: "Fare-brokered pricing", text: "Access to negotiated fares and mileage-boosting routings." },
      { title: "First-class suites", text: "Full-cabin suites with double beds, showers and onboard bars." },
      { title: "Lounge & chauffeur", text: "Complimentary chauffeur, arrivals lounge and fast-track included." },
    ],
    faqs: [{ q: "Can flights be booked separately from journeys?", a: "Yes — our air desk books stand-alone premium airfare worldwide." }],
    itemNoun: "route",
    itemNounPlural: "routes",
    detailBasePath: "/flights",
  },
  hotels: {
    slug: "hotels",
    title: "Luxury Hotels & Resorts",
    eyebrow: "The finest addresses",
    headline: "Hotels & Resorts",
    intro:
      "Preferred rates, complimentary upgrades and value-added amenities at more than 1,500 hand-selected hotels — Aman, Rosewood, Four Seasons, Belmond, Oberoi, Six Senses and Mandarin Oriental.",
    heroImage: images.hero,
    benefits: [
      { title: "VIP status guaranteed", text: "Room upgrade on arrival, daily breakfast and $100+ resort credit." },
      { title: "Priority allocations", text: "First access at soon-to-open properties." },
      { title: "24/7 hotel concierge", text: "Your Worldway specialist manages every request en route." },
    ],
    faqs: [{ q: "Do rates match booking direct?", a: "Rates match public rates, plus exclusive amenities worth $200+ per stay." }],
    itemNoun: "hotel",
    itemNounPlural: "hotels",
    detailBasePath: "/hotels",
  },
  activities: {
    slug: "activities",
    title: "Signature Activities",
    eyebrow: "In-destination experiences",
    headline: "Activities & Experiences",
    intro:
      "Private helicopters over the fjords, dinner in the Colosseum, tea with a geisha in Gion, hot-air balloons over the Serengeti — the world's most sought-after experiences.",
    heroImage: images.middleEast,
    benefits: [
      { title: "Exclusive-only access", text: "Experiences unavailable through public booking channels." },
      { title: "Master specialists", text: "Sommeliers, historians, chefs and artisans lead every experience." },
      { title: "Seamless logistics", text: "Chauffeur transfers, waived queues and dedicated hosts." },
    ],
    faqs: [{ q: "Can activities be booked without a journey?", a: "Selected in-destination experiences can be booked à la carte." }],
    itemNoun: "experience",
    itemNounPlural: "experiences",
    detailBasePath: "/activities",
  },
  transfers: {
    slug: "transfers",
    title: "Private Transfers",
    eyebrow: "Chauffeur & aviation",
    headline: "Transfers",
    intro:
      "Chauffeured Mercedes S-Class, armoured SUVs, helicopters, seaplanes and private-jet transfers — the invisible thread that connects every journey.",
    heroImage: images.jet,
    benefits: [
      { title: "Marque-vetted chauffeurs", text: "Multilingual, security-trained drivers in every major city." },
      { title: "Helicopter transfers", text: "Skip traffic across Manhattan, Nice, Cape Town and Mumbai." },
      { title: "24/7 dispatch", text: "Change plans en route; a car is repositioned in minutes." },
    ],
    faqs: [{ q: "Are child seats provided?", a: "Yes — infant, toddler and booster seats provided on request." }],
    itemNoun: "transfer service",
    itemNounPlural: "transfer services",
    detailBasePath: "/transfers",
  },
  villas: {
    slug: "villas",
    title: "Private Villas & Estates",
    eyebrow: "Whole-house rentals",
    headline: "Villas & Estates",
    intro:
      "Fully staffed private villas, historic estates and beachfront residences worldwide — from Tuscan castellos to St. Barths beachfront to Balinese cliff-top compounds.",
    heroImage: images.europe,
    benefits: [
      { title: "Fully staffed", text: "Butler, chef, housekeeping and concierge included at every property." },
      { title: "Exclusive-use", text: "The entire estate — pool, staff, grounds — is yours alone." },
      { title: "Villa concierge", text: "In-villa dining, spa therapists, private tours arranged nightly." },
    ],
    faqs: [{ q: "Minimum stay?", a: "Typically 5 nights; 7 nights in peak season." }],
    itemNoun: "villa",
    itemNounPlural: "villas",
    detailBasePath: "/villas",
  },
  yachts: {
    slug: "yachts",
    title: "Private Yacht Charters",
    eyebrow: "The blue horizon",
    headline: "Yacht Charters",
    intro:
      "Motor and sailing yacht charters worldwide — Mediterranean summers, Caribbean winters, the Galápagos, Indonesia and the South Pacific — with full crew, chef and toys.",
    heroImage: images.charter,
    benefits: [
      { title: "Vetted fleet", text: "Only crewed, professionally maintained yachts inspected annually." },
      { title: "Chef & toys included", text: "Onboard chef, tenders, jet-skis, paddleboards, dive kit." },
      { title: "Bespoke itineraries", text: "Your captain crafts the route around wind, weather and your interests." },
    ],
    faqs: [{ q: "APA — what is it?", a: "Advance Provisioning Allowance covers food, fuel and dockage — reconciled at trip end." }],
    itemNoun: "yacht",
    itemNounPlural: "yachts",
    detailBasePath: "/yachts",
  },
  insurance: {
    slug: "insurance",
    title: "Travel Insurance",
    eyebrow: "Peace of mind",
    headline: "Travel Insurance",
    intro:
      "Comprehensive travel-protection plans for luxury and adventure travellers — including cancel-for-any-reason, medical evacuation and adventure-sports cover.",
    heroImage: images.hero,
    benefits: [
      { title: "Cancel for any reason", text: "Recover 75% of your trip cost, whatever the reason." },
      { title: "Medical evacuation", text: "$1M+ evacuation coverage, worldwide." },
      { title: "Adventure sports", text: "Cover for expedition, polar, diving and heli-skiing programmes." },
    ],
    faqs: [{ q: "When must I purchase?", a: "Within 21 days of first deposit to qualify for pre-existing condition waivers." }],
    itemNoun: "plan",
    itemNounPlural: "plans",
    detailBasePath: "/insurance",
  },
  visa: {
    slug: "visa",
    title: "Visa Services",
    eyebrow: "Frictionless entry",
    headline: "Visa Services",
    intro:
      "End-to-end visa and travel-document services — application preparation, courier logistics, expedited processing and residency-by-investment referrals.",
    heroImage: images.middleEast,
    benefits: [
      { title: "Fully managed", text: "Documentation, appointments and courier handled end-to-end." },
      { title: "Expedited processing", text: "Same-day and next-day visa turnaround where possible." },
      { title: "Global coverage", text: "Every embassy, consulate and e-visa portal worldwide." },
    ],
    faqs: [{ q: "How early should I apply?", a: "6–8 weeks before travel; expedited options 3–5 business days." }],
    itemNoun: "service",
    itemNounPlural: "services",
    detailBasePath: "/visa",
  },
};

// --- ITEMS PER COLLECTION ---
// Curated seeds. TODO(Lovable Cloud): full catalogue in Supabase (~600 items).
export const collectionItems: Record<CollectionKind, CollectionItem[]> = {
  cruises: [
    { slug: "silversea-med-classics", title: "Silversea Mediterranean Classics", subtitle: "Rome to Venice, 10 nights", location: "Mediterranean", region: "europe", image: images.europe, priceFrom: 12800, duration: "10 nights", capacity: "596 guests", operator: "Silversea", highlights: ["All-suite ship", "Butler service", "Included shore excursions", "Business-class flights"], featured: true },
    { slug: "regent-splendor-caribbean", title: "Regent Seven Seas Splendor — Caribbean", subtitle: "Miami round-trip, 10 nights", location: "Caribbean", image: images.hero, priceFrom: 9800, duration: "10 nights", capacity: "750 guests", operator: "Regent Seven Seas", highlights: ["Unlimited shore excursions", "All-inclusive fares", "Free business-class air"], featured: true },
    { slug: "explora-journeys-med", title: "Explora Journeys — Riviera & Aegean", subtitle: "Nice to Athens, 12 nights", location: "Mediterranean", image: images.europe, priceFrom: 14500, duration: "12 nights", capacity: "922 guests", operator: "Explora Journeys", highlights: ["Ocean-front suites", "9 restaurants", "Immersive experiences"] },
    { slug: "seabourn-fjords", title: "Seabourn Norwegian Fjords", subtitle: "Copenhagen to Bergen, 14 nights", location: "Norway", region: "europe", image: images.polar, priceFrom: 15900, duration: "14 nights", capacity: "600 guests", operator: "Seabourn", highlights: ["Ultra-luxury small ship", "Ventures by Seabourn kayaking", "Free premium spirits"] },
    { slug: "ritz-carlton-yacht-med", title: "Ritz-Carlton Yacht Collection — Rivieras", subtitle: "Barcelona to Rome, 7 nights", location: "Mediterranean", image: images.charter, priceFrom: 13500, duration: "7 nights", capacity: "298 guests", operator: "Ritz-Carlton Yacht", highlights: ["Superyacht scale", "Aqua Marina watersports", "Signature Ritz service"] },
    { slug: "cunard-transatlantic", title: "Cunard Transatlantic Grill Suites", subtitle: "New York to Southampton, 7 nights", location: "Atlantic", image: images.hero, priceFrom: 6200, duration: "7 nights", capacity: "2,600 guests", operator: "Cunard", highlights: ["Queens Grill dining", "Legendary crossing", "Iconic Queen Mary 2"] },
  ],
  "cruises-expedition": [
    { slug: "antarctica-peninsula", title: "Antarctic Peninsula Expedition", subtitle: "Ushuaia round-trip, 11 nights", location: "Antarctica", region: "polar", image: images.polar, priceFrom: 18500, duration: "11 nights", capacity: "144 guests", operator: "Silversea Expeditions", highlights: ["Daily Zodiac landings", "Penguin rookeries", "Optional kayaking"], featured: true },
    { slug: "galapagos-yacht", title: "Galápagos on a Private Yacht", subtitle: "Baltra round-trip, 7 nights", location: "Ecuador", region: "south-america", image: images.southAmerica, priceFrom: 12800, duration: "7 nights", capacity: "16 guests", operator: "Ecoventura", highlights: ["Endemic wildlife", "Snorkelling with sea lions", "PhD naturalists"], featured: true },
    { slug: "arctic-svalbard", title: "Arctic Svalbard: In Search of Polar Bears", subtitle: "Longyearbyen round-trip, 10 nights", location: "Svalbard", region: "polar", image: images.polar, priceFrom: 15200, duration: "10 nights", capacity: "132 guests", operator: "Quark Expeditions", highlights: ["Polar bears", "Walrus haul-outs", "Zodiac & kayaking"] },
    { slug: "kimberley-coast", title: "Kimberley Coast Expedition", subtitle: "Broome to Darwin, 10 nights", location: "Australia", region: "oceania", image: images.oceania, priceFrom: 16800, duration: "10 nights", capacity: "100 guests", operator: "Ponant", highlights: ["Horizontal Falls helicopter", "Ancient rock art", "Rugged coastline"] },
    { slug: "northwest-passage", title: "Northwest Passage: Arctic Traverse", subtitle: "Greenland to Nome, 21 nights", location: "Arctic", region: "polar", image: images.polar, priceFrom: 39500, duration: "21 nights", capacity: "199 guests", operator: "Silversea", highlights: ["Historic route of Franklin", "Inuit communities", "Ice-strengthened ship"] },
  ],
  "cruises-river": [
    { slug: "amawaterways-danube", title: "Enchanting Danube by AmaWaterways", subtitle: "Budapest to Vilshofen, 7 nights", location: "Central Europe", region: "europe", image: images.europe, priceFrom: 4800, duration: "7 nights", capacity: "156 guests", operator: "AmaWaterways", highlights: ["Vienna, Bratislava, Passau", "Wachau Valley wines", "Included active excursions"], featured: true },
    { slug: "uniworld-douro", title: "Uniworld Douro Splendour", subtitle: "Porto round-trip, 7 nights", location: "Portugal", region: "europe", image: images.europe, priceFrom: 5200, duration: "7 nights", capacity: "120 guests", operator: "Uniworld", highlights: ["Port wine estates", "UNESCO Douro Valley", "All-inclusive"] },
    { slug: "aqua-mekong", title: "Aqua Mekong Discovery", subtitle: "Siem Reap to Saigon, 7 nights", location: "Southeast Asia", region: "asia", image: images.asia, priceFrom: 6800, duration: "7 nights", capacity: "40 guests", operator: "Aqua Expeditions", highlights: ["Angkor Wat pre-cruise", "Floating villages", "Design-led ship"], featured: true },
    { slug: "sanctuary-nile", title: "Sanctuary Sun Boat IV — Nile", subtitle: "Luxor to Aswan, 4 nights", location: "Egypt", region: "middle-east", image: images.middleEast, priceFrom: 4200, duration: "4 nights", capacity: "80 guests", operator: "Sanctuary Retreats", highlights: ["Valley of the Kings", "Karnak & Luxor Temples", "Private Egyptologist"] },
  ],
  "cruises-world": [
    { slug: "silversea-world-2027", title: "Silversea World Cruise 2027", subtitle: "Fort Lauderdale to Barcelona, 132 nights", location: "Worldwide", image: images.hero, priceFrom: 89500, duration: "132 nights", capacity: "596 guests", operator: "Silversea", highlights: ["61 destinations, 30 countries", "Included business-class air", "Complimentary land programme"], featured: true },
    { slug: "cunard-full-world", title: "Cunard Full World Voyage", subtitle: "Southampton round-trip, 108 nights", location: "Worldwide", image: images.hero, priceFrom: 32500, duration: "108 nights", capacity: "2,600 guests", operator: "Cunard", highlights: ["Grill Suites", "Formal nights & gala dining", "Iconic Queen Victoria"] },
    { slug: "regent-mariner-world", title: "Regent Mariner Grand Voyage", subtitle: "Miami to San Francisco, 130 nights", location: "Worldwide", image: images.hero, priceFrom: 79800, duration: "130 nights", capacity: "700 guests", operator: "Regent Seven Seas", highlights: ["All-suite ship", "Unlimited excursions", "Free business-class air"] },
  ],
  rail: [
    { slug: "vsoe-paris-venice", title: "Venice Simplon-Orient-Express", subtitle: "London — Paris — Venice, 2 nights", location: "Europe", image: images.europe, priceFrom: 5400, duration: "2 nights", operator: "Belmond", highlights: ["Historic 1920s carriages", "Multi-course fine dining", "Grande Suites available"], featured: true },
    { slug: "royal-scotsman", title: "Royal Scotsman — Grand Tour", subtitle: "Edinburgh round-trip, 7 nights", location: "Scotland", image: images.europe, priceFrom: 12800, duration: "7 nights", capacity: "40 guests", operator: "Belmond", highlights: ["Highland whisky distilleries", "Private castle dinners", "Cabin suites"] },
    { slug: "rovos-pride-of-africa", title: "Rovos Rail — Pride of Africa", subtitle: "Cape Town to Dar es Salaam, 15 nights", location: "Southern Africa", region: "africa", image: images.africa, priceFrom: 18500, duration: "15 nights", operator: "Rovos Rail", highlights: ["Victoria Falls", "Chobe safari", "Royal Suites onboard"], featured: true },
    { slug: "maharajas-express", title: "Maharajas' Express — Heritage of India", subtitle: "Delhi to Mumbai, 7 nights", location: "India", region: "asia", image: images.india, priceFrom: 9600, duration: "7 nights", operator: "IRCTC", highlights: ["Taj Mahal at sunrise", "Ranthambore tiger safari", "Presidential Suite"] },
    { slug: "rocky-mountaineer-first-passage", title: "Rocky Mountaineer — First Passage", subtitle: "Vancouver to Banff, 2 nights", location: "Canada", region: "north-america", image: images.northAmerica, priceFrom: 4400, duration: "2 nights", operator: "Rocky Mountaineer", highlights: ["Glass-domed carriages", "Daylight-only travel", "Chef-crafted regional cuisine"] },
    { slug: "seven-stars-kyushu", title: "Seven Stars in Kyushu", subtitle: "Hakata round-trip, 3 nights", location: "Japan", region: "asia", image: images.asia, priceFrom: 11800, duration: "3 nights", capacity: "28 guests", operator: "JR Kyushu", highlights: ["Japan's finest cruise train", "Onsen ryokan pre-stay", "Kaiseki dining"] },
  ],
  aviation: [
    { slug: "wonders-private-jet", title: "Wonders of the World by Private Jet", subtitle: "24 days, 12 destinations", location: "Worldwide", image: images.jet, priceFrom: 148000, duration: "24 days", capacity: "48 guests", operator: "Four Seasons Jet", highlights: ["VIP-configured B757", "Onboard chef & physician", "Aman & Four Seasons throughout"], featured: true },
    { slug: "africa-safari-jet", title: "African Safari by Private Jet", subtitle: "14 days, 5 countries", location: "Africa", region: "africa", image: images.africa, priceFrom: 92000, duration: "14 days", capacity: "48 guests", operator: "A&K Private Jet", highlights: ["Serengeti, Okavango, Cape Town", "Chartered turboprops between camps", "Master A&K guides"] },
    { slug: "jet-card-programme", title: "Jet Card Programme", subtitle: "25/50/100 hour cards", location: "Worldwide", image: images.jet, priceFrom: 165000, duration: "Annual", operator: "NetJets, Wheels Up, VistaJet", highlights: ["Guaranteed availability", "Fixed hourly rates", "Cabin-class flexibility"] },
    { slug: "empty-legs", title: "Empty-Leg Intelligence", subtitle: "Repositioning flights worldwide", location: "Worldwide", image: images.jet, priceFrom: 8500, duration: "Ad hoc", operator: "Worldway Air Desk", highlights: ["Up to 75% off retail charter", "Real-time availability", "Global broker network"] },
  ],
  tours: [
    { slug: "ak-signature-tanzania", title: "A&K Signature Tanzania Safari", subtitle: "10 days, small group", location: "Tanzania", region: "africa", image: images.africa, priceFrom: 14800, duration: "10 days", capacity: "16 guests", operator: "Abercrombie & Kent", highlights: ["Serengeti & Ngorongoro", "Master A&K guides", "Sanctuary Retreats"], featured: true },
    { slug: "kensington-japan", title: "Imperial Japan Small Group", subtitle: "12 days, hosted", location: "Japan", region: "asia", image: images.asia, priceFrom: 16400, duration: "12 days", capacity: "18 guests", operator: "Kensington Tours", highlights: ["Tokyo, Kyoto, Hakone, Kanazawa", "Tea ceremony with master", "Bullet-train transfers"] },
    { slug: "tauck-italy-classics", title: "Tauck Classic Italy", subtitle: "13 days, escorted", location: "Italy", region: "europe", image: images.europe, priceFrom: 12200, duration: "13 days", capacity: "24 guests", operator: "Tauck", highlights: ["Rome, Florence, Venice, Amalfi", "Vatican after-hours", "Palladian villa dinners"] },
    { slug: "butterfield-provence-walk", title: "Butterfield & Robinson Provence Walking", subtitle: "6 days active tour", location: "France", region: "europe", image: images.europe, priceFrom: 8600, duration: "6 days", capacity: "16 guests", operator: "Butterfield & Robinson", highlights: ["Village-to-village walking", "Truffle hunts & Michelin dining", "Historic mas hotels"] },
  ],
  "small-group": [
    { slug: "sg-cape-to-vic-falls", title: "Cape Town to Victoria Falls", subtitle: "12 days, 22 guests max", location: "Southern Africa", region: "africa", image: images.africa, priceFrom: 11800, duration: "12 days", capacity: "22 guests", highlights: ["Cape Winelands", "Sabi Sand safari", "Victoria Falls"], featured: true },
    { slug: "sg-morocco-imperial-cities", title: "Morocco Imperial Cities", subtitle: "10 days, 18 guests max", location: "Morocco", region: "middle-east", image: images.middleEast, priceFrom: 6800, duration: "10 days", capacity: "18 guests", highlights: ["Marrakech, Fes, Chefchaouen", "Sahara luxury camp", "Riad accommodations"] },
    { slug: "sg-peru-machu-picchu", title: "Peru & Machu Picchu Discovery", subtitle: "9 days, 20 guests max", location: "Peru", region: "south-america", image: images.southAmerica, priceFrom: 7900, duration: "9 days", capacity: "20 guests", highlights: ["Cusco & Sacred Valley", "Dawn at Machu Picchu", "Belmond Hiram Bingham train"] },
    { slug: "sg-jordan-holy-land", title: "Jordan & the Holy Land", subtitle: "11 days, 24 guests max", location: "Jordan & Israel", region: "middle-east", image: images.middleEast, priceFrom: 8900, duration: "11 days", capacity: "24 guests", highlights: ["Petra by candlelight", "Wadi Rum Bedouin camp", "Jerusalem old city"] },
  ],
  "tailor-made": [
    { slug: "tm-honeymoon-italian-lakes", title: "Italian Lakes & Amalfi Honeymoon", subtitle: "12 nights, private", location: "Italy", region: "europe", image: images.europe, priceFrom: 22800, duration: "12 nights", highlights: ["Villa d'Este on Lake Como", "Private Amalfi boat", "Positano cliff-top suites"], featured: true },
    { slug: "tm-japan-family-cherry-blossom", title: "Japan Family Cherry Blossom", subtitle: "14 nights, private", location: "Japan", region: "asia", image: images.asia, priceFrom: 38400, duration: "14 nights", highlights: ["Tokyo, Hakone, Kyoto, Osaka", "Family ryokan with onsen", "Ghibli & pop-culture immersion"] },
    { slug: "tm-southern-africa-fly-in", title: "Southern Africa Private Fly-In Safari", subtitle: "14 nights, private", location: "Botswana, Zambia, South Africa", region: "africa", image: images.africa, priceFrom: 46500, duration: "14 nights", highlights: ["Wilderness Safaris throughout", "Charter flights", "Cape Winelands finale"] },
    { slug: "tm-india-royal-rajasthan", title: "Royal Rajasthan Private Tour", subtitle: "13 nights, private", location: "India", region: "asia", image: images.india, priceFrom: 24800, duration: "13 nights", highlights: ["Taj Mahal at sunrise", "Palace hotels throughout", "Ranthambore tiger safari"] },
  ],
  safari: [
    { slug: "safari-serengeti-migration", title: "Serengeti Great Migration", subtitle: "10 nights, mobile camps", location: "Tanzania", region: "africa", image: images.africa, priceFrom: 18500, duration: "10 nights", operator: "Singita & Sanctuary", highlights: ["River crossings", "Mobile migration camps", "Balloon safari"], featured: true },
    { slug: "safari-okavango-water", title: "Okavango Delta Water Safari", subtitle: "8 nights, exclusive camps", location: "Botswana", region: "africa", image: images.africa, priceFrom: 22400, operator: "Wilderness Safaris", highlights: ["Mokoro & motorboat safaris", "Big cats of Vumbura", "Chief's Camp"] },
    { slug: "safari-rwanda-gorillas", title: "Rwanda Mountain Gorillas", subtitle: "6 nights, luxury lodges", location: "Rwanda", region: "africa", image: images.africa, priceFrom: 19800, operator: "Singita & One&Only", highlights: ["Two gorilla treks", "Volcanoes National Park", "Singita Kwitonda Lodge"], featured: true },
    { slug: "safari-south-luangwa", title: "South Luangwa Walking Safari", subtitle: "7 nights, small bush camps", location: "Zambia", region: "africa", image: images.africa, priceFrom: 12800, operator: "Robin Pope Safaris", highlights: ["Founder of the walking safari", "Intimate bush camps", "Leopard capital of Africa"] },
    { slug: "safari-sabi-sand-big-five", title: "Sabi Sand Big Five", subtitle: "5 nights, luxury lodge", location: "South Africa", region: "africa", image: images.africa, priceFrom: 14600, operator: "Singita, Londolozi, Royal Malewane", highlights: ["Guaranteed Big Five", "Off-road tracking", "Renowned lodges"] },
  ],
  polar: [
    { slug: "polar-antarctica-peninsula-fly", title: "Antarctica Fly-Cruise", subtitle: "8 nights, avoid the Drake", location: "Antarctica", region: "polar", image: images.polar, priceFrom: 21500, duration: "8 nights", operator: "Antarctica21", highlights: ["Fly to King George Island", "Skip the Drake Passage", "Boutique 71-guest ship"], featured: true },
    { slug: "polar-south-georgia-falklands", title: "South Georgia, Falklands & Antarctica", subtitle: "20 nights, ultimate polar", location: "Southern Ocean", region: "polar", image: images.polar, priceFrom: 32900, duration: "20 nights", operator: "Quark Expeditions", highlights: ["King penguin colonies", "Shackleton's grave", "Ice-strengthened ship"] },
    { slug: "polar-north-pole", title: "North Pole on 50 Years of Victory", subtitle: "13 nights, atomic icebreaker", location: "Arctic Ocean", region: "polar", image: images.polar, priceFrom: 39800, duration: "13 nights", operator: "Poseidon Expeditions", highlights: ["Reach 90°N", "Nuclear-powered icebreaker", "Helicopter operations"] },
    { slug: "polar-greenland-inuit", title: "Greenland: Land of the Inuit", subtitle: "12 nights, remote coast", location: "Greenland", region: "polar", image: images.polar, priceFrom: 15800, operator: "Ponant", highlights: ["Ilulissat icefjord", "Inuit village visits", "Zodiac cruising"] },
  ],
  cultural: [
    { slug: "cultural-vatican-after-hours", title: "Vatican & Rome After-Hours", subtitle: "5 nights, private access", location: "Italy", region: "europe", image: images.europe, priceFrom: 8600, duration: "5 nights", highlights: ["Sistine Chapel private opening", "Vatican Museums after-hours", "Colosseum by night"], featured: true },
    { slug: "cultural-kyoto-master-craftsmen", title: "Kyoto Master Craftsmen", subtitle: "7 nights, ryokan & atelier", location: "Japan", region: "asia", image: images.asia, priceFrom: 11400, duration: "7 nights", highlights: ["Kintsugi workshop", "Tea ceremony with master", "Nishijin weaving atelier"] },
    { slug: "cultural-india-heritage-havelis", title: "Heritage Havelis of Rajasthan", subtitle: "10 nights, palace hotels", location: "India", region: "asia", image: images.india, priceFrom: 13800, duration: "10 nights", highlights: ["Udaipur, Jodhpur, Jaipur", "Private palace dinners", "Craft master immersions"] },
    { slug: "cultural-morocco-artisans", title: "Morocco Artisans & Riads", subtitle: "9 nights, craft immersion", location: "Morocco", region: "middle-east", image: images.middleEast, priceFrom: 7900, duration: "9 nights", highlights: ["Fes tanneries with masters", "Marrakech design ateliers", "Historic riad stays"] },
  ],
  honeymoon: [
    { slug: "honeymoon-maldives-overwater", title: "Maldives Overwater Sanctuary", subtitle: "10 nights, all-villa resort", location: "Maldives", region: "asia", image: images.asia, priceFrom: 18500, duration: "10 nights", highlights: ["Overwater villa with plunge pool", "Private sandbank dinner", "Reef snorkelling"], featured: true },
    { slug: "honeymoon-bora-bora-french-polynesia", title: "Bora Bora & French Polynesia", subtitle: "12 nights, two-island", location: "French Polynesia", region: "oceania", image: images.oceania, priceFrom: 22400, duration: "12 nights", highlights: ["Overwater bungalows", "Motu picnic", "Private boat charter"] },
    { slug: "honeymoon-santorini-mykonos", title: "Santorini & Mykonos", subtitle: "10 nights, cliff-side suites", location: "Greece", region: "europe", image: images.europe, priceFrom: 14800, duration: "10 nights", highlights: ["Caldera-view suites", "Sunset yacht charter", "Cave-suite in Oia"] },
    { slug: "honeymoon-italian-lakes-tuscany", title: "Italian Lakes & Tuscany", subtitle: "12 nights, romantic estates", location: "Italy", region: "europe", image: images.europe, priceFrom: 16400, duration: "12 nights", highlights: ["Villa d'Este Lake Como", "Chianti vineyard estate", "Private truffle hunt"] },
  ],
  wellness: [
    { slug: "wellness-chiva-som", title: "Chiva-Som Retreat", subtitle: "7 nights health & wellness", location: "Thailand", region: "asia", image: images.asia, priceFrom: 6800, duration: "7 nights", highlights: ["Full health screening", "Personalised programme", "Ayurveda & holistic"], featured: true },
    { slug: "wellness-ananda-himalayas", title: "Ananda in the Himalayas", subtitle: "10 nights Ayurveda", location: "India", region: "asia", image: images.india, priceFrom: 8400, duration: "10 nights", highlights: ["Panchakarma detox", "Yoga & meditation", "Palace estate setting"] },
    { slug: "wellness-lanserhof-tegernsee", title: "Lanserhof Tegernsee", subtitle: "7 nights medical cure", location: "Germany", region: "europe", image: images.europe, priceFrom: 9800, duration: "7 nights", highlights: ["Lanserhof Cure protocol", "Full diagnostics", "Alpine setting"] },
    { slug: "wellness-six-senses-douro", title: "Six Senses Douro Valley Retreat", subtitle: "7 nights wine & wellness", location: "Portugal", region: "europe", image: images.europe, priceFrom: 7200, duration: "7 nights", highlights: ["Wine-integrated wellness", "Vineyard yoga", "Michelin dining"] },
  ],
  family: [
    { slug: "family-tanzania-safari", title: "Tanzania Family Safari", subtitle: "10 days for ages 6+", location: "Tanzania", region: "africa", image: images.africa, priceFrom: 22400, duration: "10 days", highlights: ["Family safari suites", "Junior ranger programme", "Bush picnics"], featured: true },
    { slug: "family-costa-rica-adventure", title: "Costa Rica Family Adventure", subtitle: "10 days rainforest to coast", location: "Costa Rica", region: "north-america", image: images.northAmerica, priceFrom: 14800, duration: "10 days", highlights: ["Zip-lines & rafting", "Nauyaca waterfalls", "Beachfront villa"] },
    { slug: "family-europe-multi-country", title: "Europe Multi-Country Family Journey", subtitle: "14 days London, Paris, Rome", location: "Europe", region: "europe", image: images.europe, priceFrom: 32400, duration: "14 days", highlights: ["Interconnecting suites", "Private guides for kids", "Vatican & Louvre special access"] },
    { slug: "family-galapagos-yacht", title: "Galápagos Family Yacht Charter", subtitle: "7 nights private yacht", location: "Ecuador", region: "south-america", image: images.southAmerica, priceFrom: 42800, duration: "7 nights", highlights: ["Private yacht for family", "Endemic wildlife encounters", "Certified family guides"] },
  ],
  flights: [
    { slug: "flights-emirates-first", title: "Emirates First Class Suite", subtitle: "A380 First — Dubai routes", location: "Worldwide", image: images.jet, priceFrom: 12800, priceUnit: "one-way", operator: "Emirates", highlights: ["Full private suite with door", "Onboard shower spa", "Onboard lounge"] },
    { slug: "flights-singapore-suites", title: "Singapore Airlines Suites", subtitle: "A380 Suites — Singapore routes", location: "Worldwide", image: images.jet, priceFrom: 13500, priceUnit: "one-way", operator: "Singapore Airlines", highlights: ["Double bed suite", "Book the Cook", "The Private Room lounge"] },
    { slug: "flights-etihad-residence", title: "Etihad Residence", subtitle: "Three-room A380 suite", location: "Worldwide", image: images.jet, priceFrom: 22400, priceUnit: "one-way", operator: "Etihad Airways", highlights: ["Living room, bedroom, bathroom", "Private butler", "The only three-room aircraft suite"] },
    { slug: "flights-qatar-qsuite", title: "Qatar Qsuite Business", subtitle: "Business Class Reimagined", location: "Worldwide", image: images.jet, priceFrom: 4800, priceUnit: "one-way", operator: "Qatar Airways", highlights: ["Sliding door suite", "Quad-suite family option", "Al Mourjan lounge Doha"] },
  ],
  hotels: [
    { slug: "hotel-aman-tokyo", title: "Aman Tokyo", subtitle: "The Aman in the sky", location: "Tokyo, Japan", region: "asia", image: images.asia, priceFrom: 2400, priceUnit: "per night", operator: "Aman", highlights: ["30th-floor suites", "Aman Spa & onsen", "Michelin dining"], featured: true },
    { slug: "hotel-rosewood-hong-kong", title: "Rosewood Hong Kong", subtitle: "Ultra-luxury Kowloon icon", location: "Hong Kong", region: "asia", image: images.asia, priceFrom: 850, priceUnit: "per night", operator: "Rosewood", highlights: ["Harbour-view suites", "Asaya wellness", "Chef Chan Yan Tak"] },
    { slug: "hotel-four-seasons-firenze", title: "Four Seasons Firenze", subtitle: "Renaissance palazzo hotel", location: "Florence, Italy", region: "europe", image: images.europe, priceFrom: 1600, priceUnit: "per night", operator: "Four Seasons", highlights: ["11-acre private gardens", "Michelin-starred Il Palagio", "Historic palazzo suites"], featured: true },
    { slug: "hotel-belmond-cipriani", title: "Belmond Hotel Cipriani", subtitle: "Venetian island icon", location: "Venice, Italy", region: "europe", image: images.europe, priceFrom: 1900, priceUnit: "per night", operator: "Belmond", highlights: ["Olympic-size pool", "Private launch to St Mark's", "Historic palazzo suites"] },
    { slug: "hotel-oberoi-udaivilas", title: "Oberoi Udaivilas", subtitle: "Palatial estate on Lake Pichola", location: "Udaipur, India", region: "asia", image: images.india, priceFrom: 1200, priceUnit: "per night", operator: "Oberoi", highlights: ["Semi-private pools", "Lake Palace views", "Royal Rajput heritage"] },
    { slug: "hotel-singita-sabora", title: "Singita Sabora Tented Camp", subtitle: "Serengeti tented luxury", location: "Tanzania", region: "africa", image: images.africa, priceFrom: 2800, priceUnit: "per night", operator: "Singita", highlights: ["Migration front-row", "Silver-level guides", "Just 9 tented suites"] },
  ],
  activities: [
    { slug: "activity-colosseum-dinner", title: "Private Dinner in the Colosseum", subtitle: "Rome, evening exclusive", location: "Rome, Italy", region: "europe", image: images.europe, priceFrom: 4800, priceUnit: "per couple", highlights: ["After-hours private access", "Michelin chef & sommelier", "Historian host"], featured: true },
    { slug: "activity-helicopter-fjords", title: "Helicopter Over the Norwegian Fjords", subtitle: "Bergen or Ålesund", location: "Norway", region: "europe", image: images.polar, priceFrom: 1200, priceUnit: "per guest", highlights: ["Glacier landings", "Bird's-eye of the fjords", "Champagne on ice"] },
    { slug: "activity-serengeti-balloon", title: "Serengeti Sunrise Hot-Air Balloon", subtitle: "Central Serengeti", location: "Tanzania", region: "africa", image: images.africa, priceFrom: 680, priceUnit: "per guest", highlights: ["Bush breakfast on landing", "Master pilots", "Migration overhead"], featured: true },
    { slug: "activity-tea-with-geisha", title: "Private Ozashiki with a Geisha", subtitle: "Kyoto Gion district", location: "Kyoto, Japan", region: "asia", image: images.asia, priceFrom: 1400, priceUnit: "per couple", highlights: ["Traditional dance", "Kaiseki dining", "Personal introduction"] },
  ],
  transfers: [
    { slug: "transfer-heli-nyc", title: "Manhattan Helicopter Transfer", subtitle: "JFK/EWR to Downtown", location: "New York, USA", image: images.jet, priceFrom: 1800, priceUnit: "one-way", highlights: ["Skip 90-minute traffic", "Private helipad access", "Chauffeur pickup on ground"] },
    { slug: "transfer-heli-monaco", title: "Nice to Monaco Helicopter", subtitle: "Nice Airport to Monaco heliport", location: "French Riviera", region: "europe", image: images.europe, priceFrom: 900, priceUnit: "one-way", highlights: ["7-minute flight", "Coastline views", "Monaco chauffeur on arrival"] },
    { slug: "transfer-s-class-worldwide", title: "Mercedes S-Class Chauffeur", subtitle: "24/7 in 90+ cities", location: "Worldwide", image: images.jet, priceFrom: 220, priceUnit: "per hour", highlights: ["English-speaking chauffeurs", "Real-time flight tracking", "24/7 dispatch"] },
    { slug: "transfer-seaplane-maldives", title: "Maldives Seaplane Transfer", subtitle: "Malé to any resort atoll", location: "Maldives", region: "asia", image: images.asia, priceFrom: 650, priceUnit: "round-trip", highlights: ["Private lounge in Malé", "Aerial atoll views", "Direct-to-resort"] },
  ],
  villas: [
    { slug: "villa-tuscany-castello", title: "Castello di Tuscany", subtitle: "12-bedroom private castle", location: "Tuscany, Italy", region: "europe", image: images.europe, priceFrom: 78000, priceUnit: "per week", highlights: ["Full staff of 14", "Private chef & sommelier", "45 acres of vineyard"], featured: true },
    { slug: "villa-st-barths-beachfront", title: "St Barths Beachfront Villa", subtitle: "6-bedroom oceanfront", location: "St Barths, Caribbean", image: images.hero, priceFrom: 42000, priceUnit: "per week", highlights: ["Direct beach access", "Chef & housekeeper", "Infinity pool"] },
    { slug: "villa-bali-cliff-top", title: "Bali Cliff-Top Estate", subtitle: "8-bedroom Uluwatu compound", location: "Bali, Indonesia", region: "asia", image: images.asia, priceFrom: 24000, priceUnit: "per week", highlights: ["Cliff-edge infinity pools", "24 staff", "Sunset ceremonies"] },
    { slug: "villa-cotswolds-manor", title: "Cotswolds Manor House", subtitle: "10-bedroom country estate", location: "Cotswolds, UK", region: "europe", image: images.europe, priceFrom: 38000, priceUnit: "per week", highlights: ["Historic manor", "Butler & chef", "300 private acres"] },
  ],
  yachts: [
    { slug: "yacht-med-72m-motor", title: "72m Motor Yacht — Mediterranean", subtitle: "12 guests, 20 crew", location: "Mediterranean", region: "europe", image: images.charter, priceFrom: 750000, priceUnit: "per week", capacity: "12 guests", highlights: ["Beach club & spa", "Helicopter platform", "Master chef"], featured: true },
    { slug: "yacht-caribbean-sailing", title: "60m Sailing Yacht — Caribbean", subtitle: "10 guests, luxury sailing", location: "Caribbean", image: images.charter, priceFrom: 320000, priceUnit: "per week", capacity: "10 guests", highlights: ["Wind-powered luxury", "Full water toys", "Chef & crew of 10"] },
    { slug: "yacht-galapagos-motor", title: "40m Motor Yacht — Galápagos", subtitle: "12 guests, endemic wildlife", location: "Galápagos", region: "south-america", image: images.southAmerica, priceFrom: 220000, priceUnit: "per week", capacity: "12 guests", highlights: ["PhD naturalist guides", "Dive & snorkel platform", "Full stabilisers"] },
    { slug: "yacht-indonesia-phinisi", title: "Indonesia Phinisi Charter", subtitle: "8 guests, traditional design", location: "Indonesia", region: "asia", image: images.asia, priceFrom: 68000, priceUnit: "per week", capacity: "8 guests", highlights: ["Komodo & Raja Ampat", "Dive from the boat", "Traditional teak yacht"] },
  ],
  insurance: [
    { slug: "insurance-signature-plan", title: "Worldway Signature Plan", subtitle: "For journeys $10,000+", location: "Global", image: images.hero, priceFrom: 380, priceUnit: "per trip", highlights: ["100% trip cancellation", "$500K medical", "$1M evacuation"] },
    { slug: "insurance-cfar", title: "Cancel-For-Any-Reason Cover", subtitle: "Maximum flexibility", location: "Global", image: images.hero, priceFrom: 640, priceUnit: "per trip", highlights: ["Recover 75% for any reason", "Purchase within 21 days", "Bundle with Signature"] },
    { slug: "insurance-adventure", title: "Adventure & Expedition Plan", subtitle: "Polar, dive, heli-ski", location: "Global", image: images.polar, priceFrom: 540, priceUnit: "per trip", highlights: ["Cover for expedition sports", "Evacuation from remote regions", "Search & rescue"] },
    { slug: "insurance-annual-multi-trip", title: "Annual Multi-Trip Plan", subtitle: "Frequent traveller cover", location: "Global", image: images.hero, priceFrom: 980, priceUnit: "per year", highlights: ["Unlimited trips per year", "Up to 60 days each", "Family plans available"] },
  ],
  visa: [
    { slug: "visa-uk-standard", title: "UK Standard Visitor Visa", subtitle: "Up to 6-month stay", location: "United Kingdom", image: images.europe, priceFrom: 380, priceUnit: "per applicant", highlights: ["Application drafted & reviewed", "Priority processing available", "Courier logistics"] },
    { slug: "visa-schengen", title: "Schengen Multi-Entry Visa", subtitle: "Europe short-stay", location: "Schengen Area", image: images.europe, priceFrom: 340, priceUnit: "per applicant", highlights: ["Multi-entry consideration", "Appointment scheduling", "Documentation review"] },
    { slug: "visa-usa-b1b2", title: "USA B1/B2 Visitor Visa", subtitle: "Business or tourism", location: "United States", image: images.northAmerica, priceFrom: 480, priceUnit: "per applicant", highlights: ["DS-160 preparation", "Interview coaching", "Expedited slots"] },
    { slug: "visa-esta-etias", title: "ESTA / ETIAS Fast-Track", subtitle: "Electronic authorisations", location: "USA / EU", image: images.hero, priceFrom: 120, priceUnit: "per applicant", highlights: ["Same-day filing", "Approval monitoring", "Renewal reminders"] },
  ],
};

export function getCollection(slug: CollectionKind) {
  return { meta: collectionsMeta[slug], items: collectionItems[slug] };
}

export function getCollectionItem(collection: CollectionKind, itemSlug: string) {
  return collectionItems[collection]?.find((i) => i.slug === itemSlug) ?? null;
}

export const allCollections = Object.values(collectionsMeta);
