/**
 * GLREP Journey Content Domain — content factory.
 *
 * Deterministic builders that expand a compact journey seed into a complete,
 * production-shaped {@link JourneyContent} document plus the reusable registry
 * records it depends on. This keeps content CMS-ready: future journeys add a
 * seed, not code.
 */

import {
  type AwardRecord,
  type BrochureRecord,
  type CabinRecord,
  type DestinationRecord,
  type DiningRecord,
  type ExcursionRecord,
  type JourneyContent,
  type MediaAsset,
  type OperatorRecord,
  type ReviewRecord,
  type TrainRecord,
  type UnescoSiteRecord,
} from "./model";

/** Compact authoring seed for a single journey. */
export interface JourneySeed {
  readonly destinationSlug: string;
  readonly journeyRef: string;
  readonly slug: string;
  readonly name: string;
  readonly operatorName: string;
  readonly trainName: string;
  readonly fromCity: string;
  readonly toCity: string;
  readonly durationDays: number;
  readonly summary: string;
  readonly cities: readonly string[];
  readonly unescoNames: readonly string[];
  readonly keywords: readonly string[];
  readonly path: readonly { readonly lat: number; readonly lng: number }[];
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export interface BuiltJourney {
  readonly journey: JourneyContent;
  readonly operator: OperatorRecord;
  readonly train: TrainRecord;
  readonly cabins: readonly CabinRecord[];
  readonly destinations: readonly DestinationRecord[];
  readonly unescoSites: readonly UnescoSiteRecord[];
  readonly excursions: readonly ExcursionRecord[];
  readonly dining: readonly DiningRecord[];
  readonly media: readonly MediaAsset[];
  readonly brochures: readonly BrochureRecord[];
  readonly videos: readonly VideoRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly awards: readonly AwardRecord[];
}

import type { VideoRecord } from "./model";

const placeholderImage = (id: string, alt: string): MediaAsset => ({
  id,
  kind: "image",
  url: `https://assets.worldwayluxe.com/placeholder/${id}.jpg`,
  alt,
  width: 1920,
  height: 1080,
});

/** Expand a seed into a complete content document + supporting records. */
export const buildJourney = (seed: JourneySeed): BuiltJourney => {
  const operatorId = `op-${slugify(seed.operatorName)}`;
  const trainId = `train-${seed.slug}`;
  const heroAssetId = `media-${seed.slug}-hero`;
  const galleryIds = [1, 2, 3, 4].map((n) => `media-${seed.slug}-g${n}`);
  const brochureAssetId = `media-${seed.slug}-brochure`;
  const videoAssetId = `media-${seed.slug}-video`;

  const media: MediaAsset[] = [
    placeholderImage(heroAssetId, `${seed.name} hero`),
    ...galleryIds.map((g, i) => placeholderImage(g, `${seed.name} gallery ${i + 1}`)),
    {
      id: brochureAssetId,
      kind: "brochure",
      url: `https://assets.worldwayluxe.com/brochures/${seed.slug}.pdf`,
      alt: `${seed.name} brochure`,
    },
    {
      id: videoAssetId,
      kind: "video",
      url: `https://assets.worldwayluxe.com/video/${seed.slug}.mp4`,
      alt: `${seed.name} film`,
    },
  ];

  const operator: OperatorRecord = {
    id: operatorId,
    slug: slugify(seed.operatorName),
    name: seed.operatorName,
    description: `${seed.operatorName} operates award-winning luxury rail journeys with white-glove service and meticulous itineraries.`,
    headquarters: seed.fromCity,
    logo: { assetId: heroAssetId, alt: `${seed.operatorName} logo` },
  };

  const train: TrainRecord = {
    id: trainId,
    slug: trainId,
    name: seed.trainName,
    operatorId,
    description: `The ${seed.trainName} pairs heritage craftsmanship with contemporary comfort across ${seed.durationDays} days of travel.`,
    history: `Restored and re-imagined, the ${seed.trainName} continues a storied tradition of grand rail travel.`,
    carCount: 12,
    maxGuests: 60,
    technicalSpecs: [
      { label: "Carriages", value: "12" },
      { label: "Max speed", value: "160 km/h" },
      { label: "Gauge", value: "Standard / regional" },
      { label: "Power", value: "Onboard generator + grid" },
    ],
    gallery: galleryIds.map((g) => ({ assetId: g, alt: `${seed.trainName} interior` })),
  };

  const cabins: CabinRecord[] = (
    [
      ["deluxe", "Deluxe Cabin", 2, 11],
      ["suite", "Grand Suite", 2, 18],
    ] as const
  ).map(([cabinClass, name, maxOccupancy, area]) => ({
    id: `cabin-${seed.slug}-${cabinClass}`,
    slug: `${seed.slug}-${cabinClass}`,
    name,
    trainId,
    cabinClass,
    description: `The ${name} offers en-suite comfort, fine linens, and panoramic windows.`,
    maxOccupancy,
    amenities: ["En-suite bathroom", "Climate control", "24h cabin steward", "Panoramic window"],
    floorPlan: { assetId: heroAssetId, areaSqm: area },
    gallery: [{ assetId: galleryIds[0], alt: `${name} interior` }],
  }));

  const destinations: DestinationRecord[] = seed.cities.map((city, i) => ({
    id: `dest-${slugify(city)}`,
    slug: slugify(city),
    name: city,
    country: seed.destinationSlug,
    description: `${city} is a signature stop on the ${seed.name}, rich in culture and scenery.`,
    location: seed.path[Math.min(i, seed.path.length - 1)],
    guide: `Discover the landmarks, cuisine, and history of ${city}.`,
  }));

  const unescoSites: UnescoSiteRecord[] = seed.unescoNames.map((u) => ({
    id: `unesco-${slugify(u)}`,
    slug: slugify(u),
    name: u,
    destinationId: destinations[0]?.id ?? `dest-${slugify(seed.fromCity)}`,
    inscribedYear: 1990,
    description: `${u} is a UNESCO World Heritage Site of outstanding universal value.`,
  }));

  const excursions: ExcursionRecord[] = seed.cities.slice(0, 3).map((city, i) => ({
    id: `exc-${seed.slug}-${i}`,
    slug: `${seed.slug}-${slugify(city)}-tour`,
    name: `${city} Private Tour`,
    destinationId: `dest-${slugify(city)}`,
    description: `A privately guided exploration of ${city}.`,
    durationHours: 4,
    optional: i > 0,
  }));

  const dining: DiningRecord[] = [
    {
      id: `dine-${seed.slug}-table`,
      slug: `${seed.slug}-chefs-table`,
      name: "Chef's Table",
      description: "Multi-course tasting menus crafted from regional produce.",
      cuisine: "Regional fine dining",
    },
  ];

  const brochures: BrochureRecord[] = [
    {
      id: `brochure-${seed.slug}`,
      slug: `${seed.slug}-brochure`,
      title: `${seed.name} Brochure`,
      assetId: brochureAssetId,
      pages: 24,
    },
  ];

  const videos: VideoRecord[] = [
    {
      id: `video-${seed.slug}`,
      slug: `${seed.slug}-film`,
      title: `${seed.name} Film`,
      assetId: videoAssetId,
      durationSeconds: 120,
    },
  ];

  const reviews: ReviewRecord[] = [
    {
      id: `review-${seed.slug}-1`,
      author: "Verified Traveller",
      rating: 5,
      title: "Unforgettable",
      body: `The ${seed.name} exceeded every expectation — flawless service and breathtaking scenery.`,
      date: "2025-09-01",
      verified: true,
    },
  ];

  const awards: AwardRecord[] = [
    {
      id: `award-${seed.slug}-1`,
      title: "World's Leading Luxury Train",
      organisation: "World Travel Awards",
      year: 2025,
    },
  ];

  const itinerary = Array.from({ length: seed.durationDays }, (_, i) => {
    const day = i + 1;
    const city = seed.cities[Math.min(i, seed.cities.length - 1)];
    return {
      day,
      title: `Day ${day}: ${city}`,
      description: `Explore ${city} with curated experiences before returning to the comfort of the ${seed.trainName}.`,
      destinationIds: [`dest-${slugify(city)}`],
      excursionIds: excursions
        .filter((e) => e.destinationId === `dest-${slugify(city)}`)
        .map((e) => e.id),
      meals: day === 1 ? (["dinner"] as const) : (["breakfast", "lunch", "dinner"] as const),
    };
  }).map((d) => ({ ...d, meals: [...d.meals] }));

  const journey: JourneyContent = {
    destinationSlug: seed.destinationSlug,
    journeyRef: seed.journeyRef,
    slug: seed.slug,
    name: seed.name,
    hero: {
      headline: seed.name,
      subheadline: seed.summary,
      media: { assetId: heroAssetId, alt: `${seed.name} hero` },
      ctaLabel: "Request a quote",
    },
    overview: {
      summary: seed.summary,
      body: `Spanning ${seed.durationDays} days from ${seed.fromCity} to ${seed.toCity}, the ${seed.name} is an all-inclusive luxury rail expedition.`,
      durationDays: seed.durationDays,
      fromCity: seed.fromCity,
      toCity: seed.toCity,
    },
    highlights: seed.cities
      .slice(0, 4)
      .map((c) => ({ title: c, description: `Signature experiences in ${c}.` })),
    itinerary,
    routeGeometry: {
      path: seed.path,
      distanceKm: seed.durationDays * 250,
      mapAssetId: heroAssetId,
    },
    destinationIds: destinations.map((d) => d.id),
    unescoSiteIds: unescoSites.map((u) => u.id),
    scenicHighlights: [
      {
        title: "Panoramic vistas",
        description: "Sweeping landscapes viewed from observation cars.",
      },
      { title: "Golden hour", description: "Sunrise and sunset over iconic terrain." },
    ],
    excursionIds: excursions.map((e) => e.id),
    diningIds: dining.map((d) => d.id),
    accommodation: `All cabins aboard the ${seed.trainName}, plus select pre/post hotel nights.`,
    operatorId,
    trainId,
    cabinIds: cabins.map((c) => c.id),
    observationCars: [
      { name: "Panorama Car", description: "Floor-to-ceiling windows and rotating seats." },
    ],
    loungeCars: [
      { name: "Bar Lounge", description: "Live piano, fine spirits, and afternoon tea." },
    ],
    diningCars: [
      { name: "Restaurant Car", description: "Linen service and à la carte regional menus." },
    ],
    wellnessFacilities: [
      { name: "Spa Car", description: "Treatment suite and wellness therapies." },
    ],
    includedServices: [
      "All meals",
      "Excursions",
      "Onboard beverages",
      "Cabin steward",
      "Transfers",
    ],
    optionalExperiences: ["Private guiding", "Helicopter add-on", "Extended stays"],
    departureCalendar: {
      firstDeparture: "2026-04-01",
      lastDeparture: "2026-10-31",
      frequency: "Monthly",
      departureCount: 7,
    },
    practical: {
      travelSeasons: ["Spring", "Summer", "Autumn"],
      climate: "Temperate; pack layers for variable mountain and city weather.",
      visaRequirements: "Check visa requirements for each country on the route prior to travel.",
      packingGuide: [
        "Smart-casual attire",
        "One formal outfit",
        "Comfortable walking shoes",
        "Layers",
      ],
      travelTips: ["Arrive a day early", "Carry local currency", "Respect onboard dress codes"],
      accessibility: "Limited step-free access; contact the concierge for mobility assistance.",
      sustainability: "Carbon-conscious operations with regional sourcing and waste reduction.",
    },
    faqs: [
      {
        question: "Is it all-inclusive?",
        answer: "Yes — meals, excursions, and onboard beverages are included.",
      },
      {
        question: "What should I wear?",
        answer: "Smart-casual by day; one formal evening is customary.",
      },
      {
        question: "Are flights included?",
        answer: "Flights are not included; our team can arrange them.",
      },
    ],
    reviewIds: reviews.map((r) => r.id),
    awardIds: awards.map((a) => a.id),
    brochureIds: brochures.map((b) => b.id),
    galleryIds,
    videoIds: videos.map((v) => v.id),
    trainHistory: train.history,
    routeHistory: `The route from ${seed.fromCity} to ${seed.toCity} traces historic trade and travel corridors.`,
    destinationGuides: destinations.map((d) => d.guide ?? d.name),
    relatedJourneyRefs: [],
    similarExperienceRefs: [],
    seo: {
      title: `${seed.name} | Worldway Luxe`,
      description: seed.summary.slice(0, 155),
      keywords: seed.keywords,
      canonicalPath: `/train-tours/${seed.destinationSlug}/${seed.slug}`,
      ogImageAssetId: heroAssetId,
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: seed.name,
      description: seed.summary,
      touristType: "Luxury rail travellers",
      itinerary: itinerary.map((d) => ({ "@type": "ListItem", position: d.day, name: d.title })),
    },
  };

  return {
    journey,
    operator,
    train,
    cabins,
    destinations,
    unescoSites,
    excursions,
    dining,
    media,
    brochures,
    videos,
    reviews,
    awards,
  };
};
