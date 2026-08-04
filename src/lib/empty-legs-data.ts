// Public-domain / royalty-free imagery only (Unsplash). No copyrighted operator content.
// Listings are indicative examples of typical private-aviation empty-leg routes —
// not live inventory. All bookings are subject to confirmation by the Worldway
// Private Aviation Concierge.

export type AircraftCategory =
  | "Very Light Jet"
  | "Light Jet"
  | "Midsize Jet"
  | "Super Midsize Jet"
  | "Heavy Jet"
  | "Ultra Long Range"
  | "Turboprop"
  | "VIP Airliner";

export type Aircraft = {
  slug: string;
  name: string;
  manufacturer: string;
  category: AircraftCategory;
  seats: number;
  rangeNm: number;
  cruiseKt: number;
  baggageCuFt: number;
  cabinHeightFt: number;
  amenities: string[];
  image: string;
};

// Fallback image used whenever a source URL fails to load (see AIRCRAFT_IMAGE_FALLBACK).
export const AIRCRAFT_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1600&q=80";

// Curated set of reliably-hosted Unsplash aviation photos.
export const AIRCRAFT: Aircraft[] = [
  {
    slug: "gulfstream-g650",
    name: "Gulfstream G650ER",
    manufacturer: "Gulfstream",
    category: "Ultra Long Range",
    seats: 14,
    rangeNm: 7500,
    cruiseKt: 516,
    baggageCuFt: 195,
    cabinHeightFt: 6.4,
    amenities: ["Full galley", "Private stateroom", "Satellite Wi-Fi", "Shower option"],
    image:
      "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "bombardier-global-7500",
    name: "Bombardier Global 7500",
    manufacturer: "Bombardier",
    category: "Ultra Long Range",
    seats: 17,
    rangeNm: 7700,
    cruiseKt: 516,
    baggageCuFt: 195,
    cabinHeightFt: 6.2,
    amenities: ["Four living zones", "Master suite", "Nuage seating", "Ka-band Wi-Fi"],
    image:
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "bombardier-challenger-350",
    name: "Bombardier Challenger 350",
    manufacturer: "Bombardier",
    category: "Super Midsize Jet",
    seats: 9,
    rangeNm: 3200,
    cruiseKt: 470,
    baggageCuFt: 106,
    cabinHeightFt: 6.1,
    amenities: ["Flat-floor cabin", "Wi-Fi", "Forward galley"],
    image:
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "dassault-falcon-8x",
    name: "Dassault Falcon 8X",
    manufacturer: "Dassault",
    category: "Heavy Jet",
    seats: 14,
    rangeNm: 6450,
    cruiseKt: 460,
    baggageCuFt: 140,
    cabinHeightFt: 6.2,
    amenities: ["Three lounges", "Quiet cabin", "FalconEye HUD"],
    image:
      "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "cessna-citation-longitude",
    name: "Cessna Citation Longitude",
    manufacturer: "Cessna",
    category: "Super Midsize Jet",
    seats: 9,
    rangeNm: 3500,
    cruiseKt: 476,
    baggageCuFt: 112,
    cabinHeightFt: 6.0,
    amenities: ["Flat-floor cabin", "Wi-Fi", "Belted lavatory"],
    image:
      "https://images.unsplash.com/photo-1583416750470-965b2707b355?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "embraer-praetor-600",
    name: "Embraer Praetor 600",
    manufacturer: "Embraer",
    category: "Super Midsize Jet",
    seats: 12,
    rangeNm: 4018,
    cruiseKt: 466,
    baggageCuFt: 155,
    cabinHeightFt: 6.0,
    amenities: ["Six-foot cabin", "Ka-band Wi-Fi", "Full galley"],
    image:
      "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "embraer-phenom-300e",
    name: "Embraer Phenom 300E",
    manufacturer: "Embraer",
    category: "Light Jet",
    seats: 8,
    rangeNm: 2010,
    cruiseKt: 464,
    baggageCuFt: 84,
    cabinHeightFt: 4.9,
    amenities: ["Bossa Nova interior", "Wi-Fi", "Private lavatory"],
    image:
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "hondajet-elite-ii",
    name: "HondaJet Elite II",
    manufacturer: "Honda Aircraft",
    category: "Very Light Jet",
    seats: 6,
    rangeNm: 1547,
    cruiseKt: 422,
    baggageCuFt: 66,
    cabinHeightFt: 4.8,
    amenities: ["Over-wing engines", "Quiet cabin", "Belted lavatory"],
    image:
      "https://images.unsplash.com/photo-1583416750470-965b2707b355?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "pilatus-pc-24",
    name: "Pilatus PC-24",
    manufacturer: "Pilatus",
    category: "Light Jet",
    seats: 8,
    rangeNm: 2000,
    cruiseKt: 440,
    baggageCuFt: 90,
    cabinHeightFt: 5.1,
    amenities: ["Rough-field capable", "Cargo door", "Flat-floor cabin"],
    image:
      "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "beechcraft-king-air-350i",
    name: "Beechcraft King Air 350i",
    manufacturer: "Beechcraft",
    category: "Turboprop",
    seats: 9,
    rangeNm: 1806,
    cruiseKt: 312,
    baggageCuFt: 71,
    cabinHeightFt: 4.8,
    amenities: ["Short runway capable", "Executive interior"],
    image:
      "https://images.unsplash.com/photo-1474302770737-173ee21bab63?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "hawker-900xp",
    name: "Hawker 900XP",
    manufacturer: "Hawker",
    category: "Midsize Jet",
    seats: 8,
    rangeNm: 2818,
    cruiseKt: 448,
    baggageCuFt: 50,
    cabinHeightFt: 5.75,
    amenities: ["Stand-up cabin", "Enclosed lavatory"],
    image:
      "https://images.unsplash.com/photo-1583416750470-965b2707b355?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "acj320neo",
    name: "Airbus ACJ320neo",
    manufacturer: "Airbus",
    category: "VIP Airliner",
    seats: 25,
    rangeNm: 6000,
    cruiseKt: 470,
    baggageCuFt: 700,
    cabinHeightFt: 7.4,
    amenities: ["Master suite", "Dining room", "Full lounge", "Shower"],
    image:
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1600&q=80",
  },
  {
    slug: "bbj-max-8",
    name: "Boeing BBJ MAX 8",
    manufacturer: "Boeing",
    category: "VIP Airliner",
    seats: 25,
    rangeNm: 6640,
    cruiseKt: 470,
    baggageCuFt: 780,
    cabinHeightFt: 7.1,
    amenities: ["Multi-zone cabin", "Bedroom", "Conference lounge"],
    image:
      "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=1600&q=80",
  },
];

export type EmptyLegStatus = "Available" | "On Request" | "Sold" | "Expired";

export type EmptyLeg = {
  id: string;
  fromCity: string;
  fromIata: string;
  toCity: string;
  toIata: string;
  region:
    | "Europe"
    | "North America"
    | "Middle East"
    | "Asia"
    | "Africa"
    | "Oceania"
    | "Transatlantic";
  departWindowStart: string; // ISO date
  departWindowEnd: string;
  durationHours: number;
  aircraftSlug: string;
  seats: number;
  savingsPct: number;
  indicativeFromUsd: number;
  status: EmptyLegStatus;
};

function futureIso(daysAhead: number, hour = 9) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const EMPTY_LEGS: EmptyLeg[] = [
  {
    id: "wwl-el-001",
    fromCity: "London",
    fromIata: "LTN",
    toCity: "Nice",
    toIata: "NCE",
    region: "Europe",
    departWindowStart: futureIso(3, 10),
    departWindowEnd: futureIso(3, 16),
    durationHours: 2,
    aircraftSlug: "embraer-phenom-300e",
    seats: 7,
    savingsPct: 65,
    indicativeFromUsd: 9800,
    status: "Available",
  },
  {
    id: "wwl-el-002",
    fromCity: "Paris",
    fromIata: "LBG",
    toCity: "Ibiza",
    toIata: "IBZ",
    region: "Europe",
    departWindowStart: futureIso(5, 11),
    departWindowEnd: futureIso(5, 18),
    durationHours: 2.2,
    aircraftSlug: "cessna-citation-longitude",
    seats: 8,
    savingsPct: 55,
    indicativeFromUsd: 14200,
    status: "Available",
  },
  {
    id: "wwl-el-003",
    fromCity: "Geneva",
    fromIata: "GVA",
    toCity: "London",
    toIata: "FAB",
    region: "Europe",
    departWindowStart: futureIso(2, 8),
    departWindowEnd: futureIso(2, 14),
    durationHours: 1.6,
    aircraftSlug: "bombardier-challenger-350",
    seats: 9,
    savingsPct: 60,
    indicativeFromUsd: 12500,
    status: "Available",
  },
  {
    id: "wwl-el-004",
    fromCity: "New York",
    fromIata: "TEB",
    toCity: "Miami",
    toIata: "OPF",
    region: "North America",
    departWindowStart: futureIso(4, 12),
    departWindowEnd: futureIso(4, 20),
    durationHours: 3,
    aircraftSlug: "dassault-falcon-8x",
    seats: 12,
    savingsPct: 50,
    indicativeFromUsd: 24500,
    status: "Available",
  },
  {
    id: "wwl-el-005",
    fromCity: "Los Angeles",
    fromIata: "VNY",
    toCity: "Aspen",
    toIata: "ASE",
    region: "North America",
    departWindowStart: futureIso(7, 9),
    departWindowEnd: futureIso(7, 15),
    durationHours: 2.4,
    aircraftSlug: "embraer-praetor-600",
    seats: 10,
    savingsPct: 58,
    indicativeFromUsd: 17800,
    status: "On Request",
  },
  {
    id: "wwl-el-006",
    fromCity: "New York",
    fromIata: "TEB",
    toCity: "London",
    toIata: "LTN",
    region: "Transatlantic",
    departWindowStart: futureIso(6, 21),
    departWindowEnd: futureIso(7, 6),
    durationHours: 6.8,
    aircraftSlug: "gulfstream-g650",
    seats: 13,
    savingsPct: 45,
    indicativeFromUsd: 78000,
    status: "Available",
  },
  {
    id: "wwl-el-007",
    fromCity: "Dubai",
    fromIata: "DWC",
    toCity: "Maldives",
    toIata: "MLE",
    region: "Middle East",
    departWindowStart: futureIso(5, 8),
    departWindowEnd: futureIso(5, 14),
    durationHours: 4.2,
    aircraftSlug: "bombardier-global-7500",
    seats: 14,
    savingsPct: 40,
    indicativeFromUsd: 52000,
    status: "Available",
  },
  {
    id: "wwl-el-008",
    fromCity: "Singapore",
    fromIata: "XSP",
    toCity: "Bali",
    toIata: "DPS",
    region: "Asia",
    departWindowStart: futureIso(3, 7),
    departWindowEnd: futureIso(3, 13),
    durationHours: 2.8,
    aircraftSlug: "embraer-praetor-600",
    seats: 9,
    savingsPct: 55,
    indicativeFromUsd: 22000,
    status: "Available",
  },
  {
    id: "wwl-el-009",
    fromCity: "Mumbai",
    fromIata: "BOM",
    toCity: "Delhi",
    toIata: "DEL",
    region: "Asia",
    departWindowStart: futureIso(2, 15),
    departWindowEnd: futureIso(2, 22),
    durationHours: 2,
    aircraftSlug: "hawker-900xp",
    seats: 8,
    savingsPct: 62,
    indicativeFromUsd: 11400,
    status: "Available",
  },
  {
    id: "wwl-el-010",
    fromCity: "Zurich",
    fromIata: "ZRH",
    toCity: "Sardinia",
    toIata: "OLB",
    region: "Europe",
    departWindowStart: futureIso(8, 10),
    departWindowEnd: futureIso(8, 16),
    durationHours: 1.4,
    aircraftSlug: "hondajet-elite-ii",
    seats: 5,
    savingsPct: 70,
    indicativeFromUsd: 6900,
    status: "Available",
  },
  {
    id: "wwl-el-011",
    fromCity: "Sydney",
    fromIata: "BWU",
    toCity: "Queenstown",
    toIata: "ZQN",
    region: "Oceania",
    departWindowStart: futureIso(10, 9),
    departWindowEnd: futureIso(10, 15),
    durationHours: 3.6,
    aircraftSlug: "cessna-citation-longitude",
    seats: 8,
    savingsPct: 52,
    indicativeFromUsd: 26400,
    status: "On Request",
  },
  {
    id: "wwl-el-012",
    fromCity: "Marrakech",
    fromIata: "RAK",
    toCity: "Paris",
    toIata: "LBG",
    region: "Africa",
    departWindowStart: futureIso(4, 14),
    departWindowEnd: futureIso(4, 20),
    durationHours: 3.1,
    aircraftSlug: "hawker-900xp",
    seats: 7,
    savingsPct: 60,
    indicativeFromUsd: 15200,
    status: "Available",
  },
  {
    id: "wwl-el-013",
    fromCity: "London",
    fromIata: "LTN",
    toCity: "New York",
    toIata: "TEB",
    region: "Transatlantic",
    departWindowStart: futureIso(9, 12),
    departWindowEnd: futureIso(9, 20),
    durationHours: 7.4,
    aircraftSlug: "bombardier-global-7500",
    seats: 15,
    savingsPct: 42,
    indicativeFromUsd: 84500,
    status: "Available",
  },
  {
    id: "wwl-el-014",
    fromCity: "Cannes",
    fromIata: "CEQ",
    toCity: "London",
    toIata: "LTN",
    region: "Europe",
    departWindowStart: futureIso(1, 17),
    departWindowEnd: futureIso(1, 22),
    durationHours: 2.1,
    aircraftSlug: "pilatus-pc-24",
    seats: 7,
    savingsPct: 65,
    indicativeFromUsd: 9400,
    status: "Sold",
  },
  {
    id: "wwl-el-015",
    fromCity: "Riyadh",
    fromIata: "RUH",
    toCity: "London",
    toIata: "LTN",
    region: "Middle East",
    departWindowStart: futureIso(6, 22),
    departWindowEnd: futureIso(7, 7),
    durationHours: 6.6,
    aircraftSlug: "acj320neo",
    seats: 22,
    savingsPct: 38,
    indicativeFromUsd: 165000,
    status: "Available",
  },
  {
    id: "wwl-el-016",
    fromCity: "Miami",
    fromIata: "OPF",
    toCity: "Bahamas",
    toIata: "MYNN",
    region: "North America",
    departWindowStart: futureIso(2, 11),
    departWindowEnd: futureIso(2, 17),
    durationHours: 1,
    aircraftSlug: "embraer-phenom-300e",
    seats: 7,
    savingsPct: 68,
    indicativeFromUsd: 5800,
    status: "Available",
  },
];

export function getAircraft(slug: string) {
  return AIRCRAFT.find((a) => a.slug === slug);
}

export function getLeg(id: string) {
  return EMPTY_LEGS.find((l) => l.id === id);
}

export const REGIONS = [
  "All Regions",
  "Europe",
  "North America",
  "Middle East",
  "Asia",
  "Africa",
  "Oceania",
  "Transatlantic",
] as const;
export const CATEGORIES: ("All Aircraft" | AircraftCategory)[] = [
  "All Aircraft",
  "Very Light Jet",
  "Light Jet",
  "Midsize Jet",
  "Super Midsize Jet",
  "Heavy Jet",
  "Ultra Long Range",
  "Turboprop",
  "VIP Airliner",
];
