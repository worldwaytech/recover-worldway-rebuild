/** Confirms whether the missing allocated-suite feed is voyage-specific or channel-wide. */
import { bookingCall } from "../src/lib/crystal/aktg-booking.server";
import { fetchAktgVoyages } from "../src/lib/crystal/aktg.server";

const L: string[] = [];
const log = (...a: unknown[]) => {
  const s = [new Date().toISOString(), ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x)))].join(" ");
  L.push(s);
  console.log(s);
};

let codes: string[] = [];
try {
  const feed = await fetchAktgVoyages({});
  codes = (feed?.voyages ?? []).slice(0, 5).map((v: { code: string }) => v.code);
} catch (e) {
  log("shopping feed error", String(e));
}
log("voyages sampled", codes);

for (const code of codes) {
  for (const currency of ["USD", "EUR"]) {
    try {
      const ns = await bookingCall<any>({ operation: "netfares", query: { voyageNumber: code, currency } });
      const rows = ns?.body?.suiteAvailability ?? [];
      log("netfares", code, currency, "rows", rows.length, JSON.stringify(ns?.errors ?? []));
    } catch (e) {
      log("netfares FAIL", code, currency, String(e));
    }
  }
}
try {
  const pt = await bookingCall<any>({ operation: "pricetypes" });
  log("net fare price types available", JSON.stringify((pt ?? []).filter((p: any) => p.isNetFare)));
} catch (e) {
  log("pricetypes FAIL", String(e));
}
await Bun.write("/tmp/crystal/step4.log", L.join("\n"));
