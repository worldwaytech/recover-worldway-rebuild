// UP17 city master seed.
// This file is intentionally server-only so the full master (when supplied by
// UP17) can be large without bloating the client bundle.
//
// To replace with the complete UP17 Hotel/Bus City Master:
//   1. Paste the master JSON array into the `CITY_SEED` constant below, OR
//   2. Replace this file contents with the exported master from UP17.
//
// Each row must contain:
//   cityId: string   (UP17 numeric city id)
//   city: string     (display city name)
//   country: string  (display country name)
//   countryCode: string (ISO-2 country code, e.g. IN)
//   type: 'hotel' | 'bus' | 'both'  (which UP17 service recognises this id)

export type Up17City = {
  cityId: string;
  city: string;
  country: string;
  countryCode: string;
  type: "hotel" | "bus" | "both";
};

// Verified against the live UP17 production API. These are the seed ids that
// returned valid search tokens. The full master will supersede this list.
export const CITY_SEED: Up17City[] = [
  { cityId: "130443", city: "New Delhi", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130444", city: "Mumbai", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130445", city: "Bangalore", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130446", city: "Chennai", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130447", city: "Kolkata", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130448", city: "Hyderabad", country: "India", countryCode: "IN", type: "both" },
  { cityId: "130455", city: "Kochi", country: "India", countryCode: "IN", type: "both" },
];

const PRIORITY = new Set(["New Delhi", "Mumbai", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Goa", "Jaipur", "Dubai", "London", "New York", "Singapore", "Bangkok"]);

export function searchUp17Cities(query: string, limit = 12): Up17City[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { city: Up17City; score: number }[] = [];
  for (const row of CITY_SEED) {
    const city = row.city.toLowerCase();
    const country = row.country.toLowerCase();
    let score = -1;
    if (city === q) score = 0;
    else if (city.startsWith(q)) score = 1;
    else if (city.includes(q)) score = 2;
    else if (country.startsWith(q)) score = 3;
    if (score < 0) continue;
    if (PRIORITY.has(row.city)) score -= 0.5;
    scored.push({ city: row, score });
  }
  scored.sort((a, b) => a.score - b.score || a.city.city.localeCompare(b.city.city));
  return scored.slice(0, limit).map((s) => s.city);
}

export function findUp17CityByName(name: string): Up17City | null {
  const q = name.trim().toLowerCase();
  return (
    CITY_SEED.find(
      (c) =>
        c.city.toLowerCase() === q ||
        `${c.city}, ${c.country}`.toLowerCase() === q ||
        c.city.toLowerCase().startsWith(q),
    ) ?? null
  );
}
