// Browse-hub registry for the licensed guided-journey catalogue.
// Every hub maps to a real supplier taxonomy value (verified against the
// operator's /tour_categories endpoint) so each landing page is populated
// exclusively from licensed, bookable inventory.

export type BrowseHub = {
  slug: string;
  title: string;
  eyebrow: string;
  headline: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  image: string;
  /** Locked supplier filters applied to every search on this hub. */
  lock: { category?: string; q?: string; region?: string; durationMin?: number };
  /** quote-only hubs have no live supplier inventory yet. */
  mode: "catalogue" | "request";
  requestHref?: string;
  faqs: { q: string; a: string }[];
  related: string[];
};

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2000&q=80`;

function hub(
  slug: string,
  title: string,
  eyebrow: string,
  headline: string,
  intro: string,
  image: string,
  lock: BrowseHub["lock"],
  faqs: { q: string; a: string }[],
  related: string[],
  mode: BrowseHub["mode"] = "catalogue",
  requestHref?: string,
): BrowseHub {
  return {
    slug,
    title,
    eyebrow,
    headline,
    intro,
    seoTitle: `${title} — Worldway Travels Group`,
    seoDescription: intro.slice(0, 155),
    image,
    lock,
    mode,
    requestHref,
    faqs,
    related,
  };
}

const priceFaq = {
  q: "Are the prices shown live?",
  a: "Yes. Every price is retrieved from the operator at the moment you search, in the currency you select, and reflects the lowest available room type on a live departure.",
};
const bookFaq = {
  q: "How do I book?",
  a: "Open any journey, choose a departure date and room type, then reserve it directly. Your travel director confirms the booking and issues documentation.",
};

export const BROWSE_HUBS: BrowseHub[] = [
  hub(
    "luxury-journeys",
    "Luxury Journeys",
    "Signature",
    "Elevated journeys, effortlessly delivered.",
    "Our most refined guided journeys: premium accommodation, smaller parties, private access and unhurried pacing across every continent.",
    img("photo-1520250497591-112f2f40a3f4"),
    { category: "The Geluxe Collection" },
    [
      priceFaq,
      {
        q: "What makes a journey 'luxury' here?",
        a: "Upgraded accommodation, elevated dining, reduced group sizes and premium included experiences, as graded by the operator's own service level.",
      },
    ],
    ["small-group-journeys", "private-journeys", "tailor-made"],
  ),
  hub(
    "small-group-journeys",
    "Small Group Journeys",
    "Travel style",
    "Small parties. Deeper access.",
    "Guided departures capped at intimate group sizes, led by local specialists, with the logistics handled end to end.",
    img("photo-1533105079780-92b9be482077"),
    { category: "Small Group" },
    [
      {
        q: "How large are the groups?",
        a: "Group size is published on each journey page and comes straight from the operator's departure record — typically between eight and sixteen travellers.",
      },
      bookFaq,
    ],
    ["luxury-journeys", "solo-travel", "cultural-experiences"],
  ),
  hub(
    "private-journeys",
    "Private Journeys",
    "Exclusive",
    "Your party only, on your dates.",
    "Independent and privately guided departures that run for your travelling party alone, with flexible dates and a dedicated local guide.",
    img("photo-1502920917128-1aa500764cbd"),
    { category: "Independent Travel" },
    [
      {
        q: "Can we move the dates?",
        a: "Private and independent journeys can usually start on any date the operator has ground capacity. Send a request and your travel director confirms the calendar.",
      },
      priceFaq,
    ],
    ["tailor-made", "luxury-journeys", "family-journeys"],
  ),
  hub(
    "family-journeys",
    "Family Journeys",
    "Together",
    "Journeys built around every age.",
    "Departures designed for multi-generational travel: family-friendly pacing, connecting rooms, and experiences that hold the attention of children and adults alike.",
    img("photo-1503919545889-aef636e10ad4"),
    { category: "Family" },
    [
      {
        q: "Is there a minimum age?",
        a: "Each family journey publishes its own minimum age on the detail page, sourced from the operator's trip record.",
      },
      bookFaq,
    ],
    ["wildlife", "cultural-experiences", "adventure-travel"],
  ),
  hub(
    "expedition-travel",
    "Expedition Travel",
    "Frontier",
    "Small ships. Remote coastlines.",
    "Marine and small-vessel expeditions with naturalist-led landings, zodiac excursions and itineraries that follow wildlife and weather rather than a fixed port schedule.",
    img("photo-1551986782-d0169b3f8fa7"),
    { category: "Marine" },
    [
      {
        q: "What is included on an expedition voyage?",
        a: "Landings, expedition staff, onboard lectures and most meals are typically included; the inclusions list on each voyage is taken directly from the operator.",
      },
      priceFaq,
    ],
    ["polar-expeditions", "sailing-and-yachts", "wildlife"],
  ),
  hub(
    "safari",
    "Safari Journeys",
    "Wild Africa",
    "Great migrations and quiet camps.",
    "Guided safari itineraries across East and Southern Africa, from the Masai Mara and Serengeti to the Okavango Delta and Kruger.",
    img("photo-1516426122078-c23e76319801"),
    { q: "safari" },
    [
      {
        q: "When is the best time for a safari?",
        a: "Wildlife density peaks in the dry season, and the Mara–Serengeti migration crossings run roughly July to October. Filter by departure month to match your dates.",
      },
      bookFaq,
    ],
    ["wildlife", "photography-tours", "luxury-journeys"],
  ),
  hub(
    "polar-expeditions",
    "Polar Expeditions",
    "Ends of the earth",
    "Antarctica and the high Arctic.",
    "Ice-strengthened small-ship voyages to Antarctica, South Georgia, the Falklands and the Arctic, with expedition teams and daily landings.",
    img("photo-1531176175280-33e81ea9b0f7"),
    { q: "Polar" },
    [
      {
        q: "How far ahead should we book?",
        a: "Polar seasons are short and cabins sell out early — most travellers book nine to eighteen months ahead. Live cabin availability is shown per departure.",
      },
      priceFaq,
    ],
    ["expedition-travel", "wildlife", "photography-tours"],
  ),
  hub(
    "rail-journeys",
    "Rail Journeys",
    "By rail",
    "The landscape, at window speed.",
    "Scenic and sleeper rail itineraries that thread cities, mountains and coastlines together without a single airport transfer.",
    img("photo-1474487548417-781cb71495f3"),
    { category: "Rail" },
    [
      {
        q: "Are rail tickets included?",
        a: "Rail segments listed in the itinerary are included in the journey price; optional upgrades are shown separately where the operator offers them.",
      },
      bookFaq,
    ],
    ["cultural-experiences", "multi-country-journeys", "luxury-journeys"],
  ),
  hub(
    "adventure-travel",
    "Adventure Travel",
    "Go further",
    "Journeys with a pulse.",
    "Bigger, bolder itineraries: high passes, jungle rivers, desert crossings and the logistics to make them straightforward.",
    img("photo-1454391304352-2bf4678b1a7a"),
    { q: "Adventure" },
    [
      {
        q: "How fit do I need to be?",
        a: "Every journey carries the operator's physical grading from 1 (easy) to 5 (challenging), shown on the detail page.",
      },
      bookFaq,
    ],
    ["walking-and-trekking", "active-adventures", "cycling"],
  ),
  hub(
    "cultural-experiences",
    "Cultural Experiences",
    "Immersion",
    "Time with the people who live there.",
    "Local-living journeys built around host families, craft traditions, markets and community-run experiences rather than a checklist of sights.",
    img("photo-1493976040374-85c8e12f0c0e"),
    { category: "Local Living" },
    [
      {
        q: "Are community experiences fairly paid?",
        a: "Community and social-enterprise experiences are operated under the supplier's own social-impact programme, and are flagged on the journey page where applicable.",
      },
      priceFaq,
    ],
    ["food-and-wine", "festivals", "small-group-journeys"],
  ),
  hub(
    "food-and-wine",
    "Food & Wine Journeys",
    "At the table",
    "Eat your way through a country.",
    "Culinary itineraries: producer visits, market mornings, cooking with local families, and cellar doors in the regions that made the bottle.",
    img("photo-1414235077428-338989a2e8c0"),
    { q: "Food" },
    [
      {
        q: "Are dietary requirements handled?",
        a: "Yes — note them on your reservation and your travel director passes them to the operator before departure.",
      },
      bookFaq,
    ],
    ["cultural-experiences", "wellness-retreats", "luxury-journeys"],
  ),
  hub(
    "wellness-retreats",
    "Wellness Retreats",
    "Restore",
    "Slower days, deliberately.",
    "Journeys paced for recovery: movement, thermal waters, coastal air, mindful mornings and unhurried afternoons.",
    img("photo-1544161515-4ab6ce6db874"),
    { category: "Wellness" },
    [
      {
        q: "Is a wellness journey suitable for beginners?",
        a: "Yes. Sessions are graded for mixed ability and the physical grading for the journey is published on its page.",
      },
      priceFaq,
    ],
    ["walking-and-trekking", "food-and-wine", "solo-travel"],
  ),
  hub(
    "photography-tours",
    "Photography Journeys",
    "Through the lens",
    "Built around the light.",
    "Itineraries timed to golden hour, migration, bloom and ice, with pacing that gives you the time a frame actually needs.",
    img("photo-1452421822248-d4c2b47f0c81"),
    { q: "Photography" },
    [
      {
        q: "What gear should I bring?",
        a: "Each journey publishes a packing and equipment guide from the operator on its detail page where one is supplied.",
      },
      bookFaq,
    ],
    ["wildlife", "safari", "polar-expeditions"],
    "request",
    "/contact",
  ),
  hub(
    "walking-and-trekking",
    "Walking & Trekking",
    "On foot",
    "The route is the itinerary.",
    "Day walks to multi-day treks — coastal paths, pilgrim routes and high-altitude classics with porters and permits arranged.",
    img("photo-1551632811-561732d1e306"),
    { q: "Trekking" },
    [
      {
        q: "Are permits included?",
        a: "Trek permits required by the itinerary are included and arranged by the operator; any optional add-on is listed separately.",
      },
      bookFaq,
    ],
    ["adventure-travel", "active-adventures", "cycling"],
  ),
  hub(
    "cycling",
    "Cycling Journeys",
    "Two wheels",
    "Country roads, properly supported.",
    "Supported cycling itineraries with luggage transfers, mechanics and route options for mixed-ability groups.",
    img("photo-1471506480208-91b3a4cc78be"),
    { q: "Cycling" },
    [
      {
        q: "Are bikes provided?",
        a: "Bike hire arrangements vary by journey and are stated in the inclusions supplied by the operator.",
      },
      priceFaq,
    ],
    ["active-adventures", "walking-and-trekking", "adventure-travel"],
  ),
  hub(
    "active-adventures",
    "Active Adventures",
    "Keep moving",
    "Days that earn dinner.",
    "Multi-sport itineraries mixing hiking, paddling, cycling and swimming, graded so you know exactly what you are signing up for.",
    img("photo-1533240332313-0db49b459ad6"),
    { category: "Active" },
    [
      {
        q: "How are activity levels graded?",
        a: "The operator grades every journey from 1 (easy) to 5 (challenging); the grade appears on each journey page.",
      },
      bookFaq,
    ],
    ["walking-and-trekking", "cycling", "adventure-travel"],
  ),
  hub(
    "wildlife",
    "Wildlife Journeys",
    "In the field",
    "Species first, itinerary second.",
    "Journeys planned around wildlife: primate treks, big-cat country, endemic islands, whale seasons and birding corridors.",
    img("photo-1547970810-dc1eac37d174"),
    { q: "Wildlife" },
    [
      {
        q: "Are sightings guaranteed?",
        a: "No responsible operator guarantees a sighting. Itineraries are timed to the seasons that give the best realistic chance.",
      },
      priceFaq,
    ],
    ["safari", "photography-tours", "expedition-travel"],
  ),
  hub(
    "festivals",
    "Festival Journeys",
    "Occasions",
    "Be there for the day itself.",
    "Departures scheduled around Holi, Day of the Dead, Songkran, Carnaval, Hogmanay and the celebrations worth crossing a world for.",
    img("photo-1533174072545-7a4b6ad7a6c3"),
    { q: "Festival" },
    [
      {
        q: "Do festival departures sell out?",
        a: "Frequently — festival dates are fixed and capacity is limited, so these departures close earliest.",
      },
      bookFaq,
    ],
    ["cultural-experiences", "food-and-wine", "small-group-journeys"],
  ),
  hub(
    "multi-country-journeys",
    "Multi-Country Journeys",
    "Grand tours",
    "More than one border.",
    "Longer itineraries that link several countries into one continuous, logistically-solved journey.",
    img("photo-1476514525535-07fb3b4ae5f1"),
    { q: "Multi" },
    [
      {
        q: "Are visas handled?",
        a: "Visa requirements for each country on the route are listed on the journey page; our visa desk can process applications on request.",
      },
      bookFaq,
    ],
    ["rail-journeys", "adventure-travel", "cultural-experiences"],
  ),
  hub(
    "solo-travel",
    "Solo Travel",
    "On your own terms",
    "Alone, but never lonely.",
    "Departures built for solo travellers, with room-share matching and reduced or waived single supplements where the operator offers them.",
    img("photo-1469854523086-cc02fe5d8800"),
    { category: "Solo-ish Adventures" },
    [
      {
        q: "Do I have to pay a single supplement?",
        a: "Many of these departures offer room-share matching at no supplement; where a single room is required the supplement is shown at reservation.",
      },
      priceFaq,
    ],
    ["small-group-journeys", "wellness-retreats", "cultural-experiences"],
  ),
  hub(
    "honeymoon",
    "Honeymoon Journeys",
    "Just married",
    "Slow starts, long horizons.",
    "Upgraded-accommodation journeys pairing discovery with genuine downtime — the comfort level and pace a honeymoon should actually have.",
    img("photo-1518495973542-4542c06a5843"),
    { category: "Upgraded" },
    [
      {
        q: "Can you arrange a special occasion?",
        a: "Yes — flag it on your reservation and your travel director requests room and dining arrangements with the operator.",
      },
      bookFaq,
    ],
    ["luxury-journeys", "wellness-retreats", "private-journeys"],
  ),
  hub(
    "luxury-cruises",
    "Luxury Cruises",
    "At sea",
    "Ocean itineraries, licensed and live.",
    "Cruise itineraries available through our licensed supplier network, with live departure calendars and cabin pricing.",
    img("photo-1548574505-5e239809ee19"),
    { q: "Cruise" },
    [
      {
        q: "Which cruise lines are available?",
        a: "Only lines we hold a current distribution agreement with are listed. Additional lines appear automatically as agreements are signed.",
      },
      priceFaq,
    ],
    ["river-cruises", "expedition-travel", "sailing-and-yachts"],
  ),
  hub(
    "river-cruises",
    "River Cruises",
    "Inland waters",
    "City centres, from the water.",
    "River itineraries on the Danube, Rhine, Nile, Mekong and Amazon, mooring in the middle of the places you came to see.",
    img("photo-1467269204594-9661b134dd2b"),
    { q: "River Cruise" },
    [
      {
        q: "Are shore excursions included?",
        a: "Included excursions are listed per day in the itinerary; optional excursions are shown with their supplier price.",
      },
      bookFaq,
    ],
    ["luxury-cruises", "cultural-experiences", "rail-journeys"],
    "request",
    "/contact",
  ),
  hub(
    "sailing-and-yachts",
    "Sailing & Yacht Experiences",
    "Under sail",
    "Small decks, quiet anchorages.",
    "Crewed yacht and small-sail itineraries through island chains reached only from the water, quoted per charter while we onboard dedicated yacht suppliers.",
    img("photo-1544551763-46a013bb70d5"),
    {},
    [
      {
        q: "Is sailing experience needed?",
        a: "No. These voyages are crewed; you are welcome to help on deck but nothing is required of you.",
      },
      {
        q: "Why is this quoted rather than booked online?",
        a: "We are onboarding dedicated yacht suppliers. Until their live inventory feed is connected, our marine desk quotes each charter individually.",
      },
    ],
    ["expedition-travel", "luxury-cruises", "wildlife"],
    "request",
    "/yachts",
  ),
  hub(
    "private-aviation",
    "Private Aviation",
    "By air",
    "Charter, empty legs and private jet journeys.",
    "Private jet charter, empty-leg availability and jet-supported itineraries, quoted per request by our aviation desk.",
    img("photo-1540962351504-03099e0a754b"),
    {},
    [
      {
        q: "How is a charter quoted?",
        a: "Send the route, dates and passenger count. Our aviation desk returns aircraft options with all-in pricing, usually the same working day.",
      },
      {
        q: "What is an empty leg?",
        a: "A repositioning flight sold at a substantial discount. Availability is short-notice and route-fixed — see the live empty-leg board.",
      },
    ],
    ["luxury-journeys", "tailor-made", "private-journeys"],
    "request",
    "/private-jets",
  ),
  hub(
    "tailor-made",
    "Tailor-Made Travel",
    "Designed for you",
    "Start from a blank page.",
    "Purpose-built itineraries designed around your dates, pace, party and interests, drawing on every licensed supplier we hold.",
    img("photo-1488646953014-85cb44e25828"),
    { category: "TailorMade" },
    [
      {
        q: "How long does a proposal take?",
        a: "A first outline itinerary usually reaches you within two working days of the briefing call.",
      },
      {
        q: "Is there a design fee?",
        a: "No design fee. The itinerary is quoted as a single all-in price before you commit to anything.",
      },
    ],
    ["private-journeys", "luxury-journeys", "private-aviation"],
    "request",
    "/contact",
  ),
];

export const hubBySlug = (slug: string) => BROWSE_HUBS.find((h) => h.slug === slug);

export const HUB_GROUPS: { title: string; slugs: string[] }[] = [
  {
    title: "How you travel",
    slugs: [
      "luxury-journeys",
      "small-group-journeys",
      "private-journeys",
      "family-journeys",
      "solo-travel",
      "tailor-made",
    ],
  },
  {
    title: "Water & rail",
    slugs: [
      "luxury-cruises",
      "river-cruises",
      "expedition-travel",
      "sailing-and-yachts",
      "rail-journeys",
      "private-aviation",
    ],
  },
  {
    title: "What you came for",
    slugs: [
      "safari",
      "wildlife",
      "polar-expeditions",
      "cultural-experiences",
      "food-and-wine",
      "festivals",
      "photography-tours",
      "honeymoon",
    ],
  },
  {
    title: "Active",
    slugs: [
      "adventure-travel",
      "walking-and-trekking",
      "cycling",
      "active-adventures",
      "wellness-retreats",
      "multi-country-journeys",
    ],
  },
];
