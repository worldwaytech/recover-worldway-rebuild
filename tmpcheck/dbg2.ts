import { suggestDestinations } from "../src/lib/ratehawk/hotels.server";
for (const q of ["test", "London", "Rome", "hotel"]) {
  const r = await suggestDestinations(q);
  const d: any = r.ok ? r.data : r.error;
  console.log(q, "->", JSON.stringify((d?.hotels ?? []).map((h: any) => [h.id, h.hid])));
}
