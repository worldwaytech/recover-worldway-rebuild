import { gFetch, toursStatus, probeToursWriteScope } from "../src/lib/tours.server";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
log("status", JSON.stringify(toursStatus()));
const gets: [string,string][] = [
  ["root","/"],
  ["dossiers","/tour_dossiers?max_per_page=1"],
  ["departures","/departures?max_per_page=1"],
  ["agencies","/agencies?max_per_page=1"],
  ["agency","/agencies/" + (process.env.TOURS_AGENCY_CODE ?? "")],
  ["profile","/profile"],
  ["bookings-list","/bookings?max_per_page=1"],
  ["requirements","/requirements?max_per_page=1"],
  ["checkin","/checkin_requirements?max_per_page=1"],
  ["invoices","/invoices?max_per_page=1"],
  ["documents","/documents?max_per_page=1"],
  ["travel_credits","/travel_credits?max_per_page=1"],
  ["insurance","/insurance_products?max_per_page=1"],
  ["merch","/merchandises?max_per_page=1"],
];
for (const [label, path] of gets) {
  const t = Date.now();
  const r = await gFetch<Record<string, unknown>>(path);
  log(label, path, r.status, r.ok ? "OK" : (r.error ?? ""), `${Date.now()-t}ms`,
    r.ok ? JSON.stringify(r.data).slice(0,220) : "");
}
log("writeScope", JSON.stringify(await probeToursWriteScope(true)));
