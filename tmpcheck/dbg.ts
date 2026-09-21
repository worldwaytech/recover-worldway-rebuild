import { searchHotels, normaliseHotelOffers } from "../src/lib/ratehawk/hotels.server";
const r = await searchHotels({ regionId: 2011, checkin: "2026-12-10", checkout: "2026-12-12", residency: "gb", guests: [{ adults: 2 }] } as never);
if (!r.ok) { console.log("ERR", r.error); process.exit(0); }
const raw: any = r.data;
const hotels = raw?.hotels ?? [];
console.log("raw hotels", hotels.length, "first keys", Object.keys(hotels[0] ?? {}));
console.log("first rates", (hotels[0]?.rates ?? []).length, JSON.stringify((hotels[0]?.rates ?? [])[0] ?? {}).slice(0, 500));
console.log("normalised", normaliseHotelOffers(raw).length);
