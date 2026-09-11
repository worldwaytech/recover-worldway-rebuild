export const CRUISEA_TYPES = ["Ocean", "River", "Luxury", "Expedition"] as const;
export type CruiseaType = (typeof CRUISEA_TYPES)[number];

export const CRUISEA_CABIN_CATEGORIES = ["Inside", "Oceanview", "Balcony", "Suite"] as const;
export type CruiseaCabinCategory = (typeof CRUISEA_CABIN_CATEGORIES)[number];

export const CRUISEA_DURATIONS = [
  { value: "1-5", label: "1–5 nights", min: 1, max: 5 },
  { value: "6-8", label: "6–8 nights", min: 6, max: 8 },
  { value: "9-12", label: "9–12 nights", min: 9, max: 12 },
  { value: "13+", label: "13+ nights", min: 13, max: 400 },
] as const;

export type CruiseaSailing = {
  id: string;
  title: string;
  cruiseLine: string;
  shipName: string;
  cruiseType: string;
  region: string;
  country: string;
  embarkationPort: string;
  disembarkationPort: string;
  departureDate: string;
  durationNights: number;
  description: string;
  highlights: string[];
  imageUrl: string | null;
  areaTags: string[];
  packageOptions: string[];
};

export type CruiseaCabin = {
  id: string;
  sailingId: string;
  category: string;
  label: string;
  pricePerGuest: number;
  availableInventory: number;
};

export type CruiseaSailingSummary = CruiseaSailing & {
  fromPrice: number | null;
  cabinCount: number;
  cabinCategories: string[];
  totalInventory: number;
};

export type CruiseaSailingDetail = CruiseaSailing & {
  cabins: CruiseaCabin[];
  fromPrice: number | null;
};

export type CruiseaFilters = {
  query?: string;
  cruiseType?: string;
  region?: string;
  country?: string;
  company?: string;
  ship?: string;
  duration?: string;
  departureDate?: string;
  departureMonth?: string;
  embarkationPort?: string;
  cabinCategory?: string;
  areaTag?: string;
  packageOptions?: string[];
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  sort?: "departure" | "price-asc" | "price-desc" | "duration";
  page?: number;
  pageSize?: number;
};

export type CruiseaFacets = {
  companies: { company: string; ships: string[]; sailings: number }[];
  cruiseTypes: { value: string; count: number }[];
  regions: { value: string; count: number }[];
  countries: { value: string; count: number }[];
  ports: { value: string; count: number }[];
  areaTags: { value: string; count: number }[];
  packageOptions: { value: string; count: number }[];
  cabinCategories: { value: string; count: number }[];
  departureMonths: { month: string; label: string; count: number }[];
  departureDates: { date: string; sailings: number }[];
  priceRange: { min: number; max: number };
};

export type CruiseaAvailability = {
  sailingId: string;
  cabinId: string;
  guests: number;
  available: boolean;
  reason?: string;
  category: string;
  label: string;
  pricePerGuest: number;
  totalPrice: number;
  currency: string;
  remainingInventory: number;
  revalidatedAt: string;
};

export type CruiseaBooking = {
  id: string;
  reference: string | null;
  status: string;
  paymentStatus: string;
  guestCount: number;
  totalPrice: number;
  currency: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  notes: string | null;
  holdExpiresAt: string | null;
  createdAt: string;
  sailing: CruiseaSailing | null;
  cabin: Pick<CruiseaCabin, "id" | "category" | "label" | "pricePerGuest"> | null;
  passengers: { id: string; firstName: string; lastName: string; dateOfBirth: string | null }[];
};

export function durationMatches(nights: number, duration?: string): boolean {
  if (!duration) return true;
  const band = CRUISEA_DURATIONS.find((d) => d.value === duration);
  if (!band) return true;
  return nights >= band.min && nights <= band.max;
}

export function formatCruiseaMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCruiseaDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
