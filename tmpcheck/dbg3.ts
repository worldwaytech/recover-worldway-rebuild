import { searchHotels, getHotelRates, normaliseHotelOffers, createBookingForm } from "../src/lib/ratehawk/hotels.server";
import { randomUUID } from "node:crypto";
const base = { checkin: "2026-12-10", checkout: "2026-12-12", residency: "gb", guests: [{ adults: 2 }] };
const s = await searchHotels({ ...base, hotelIds: ["test_hotel_do_not_book"] } as never);
console.log("serp by test id ok=", s.ok, JSON.stringify(s.ok ? (s.data as any)?.hotels?.map((h: any) => [h.id, h.hid, h.rates?.length]) : s.error));
const hp = await getHotelRates({ ...base, hid: 8473727 } as never);
const offers = hp.ok ? normaliseHotelOffers(hp.data) : [];
console.log("hp ok=", hp.ok, "rates", offers[0]?.rates.length ?? 0, hp.ok ? "" : JSON.stringify(hp.error));
const bh = offers[0]?.rates[0]?.bookHash;
if (bh) {
  const f = await createBookingForm({ partnerOrderId: `wwl-sbx-${randomUUID()}`, bookHash: bh, userIp: "203.0.113.10" });
  console.log("form ok=", f.ok, f.ok ? JSON.stringify(f.data).slice(0, 200) : JSON.stringify(f.error));
}
