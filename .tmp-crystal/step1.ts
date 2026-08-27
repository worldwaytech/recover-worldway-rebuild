import { fetchAktgVoyages, revalidateAktgVoyage } from "../src/lib/crystal/aktg.server";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const feed = await fetchAktgVoyages();
log("voyages", feed.voyages?.length, "live=", (feed as any).live, (feed as any).error ?? "");
const v = (feed.voyages ?? []).slice(0, 5);
for (const x of v) log("voyage", x.code, x.shipName, x.departureDate, x.nights, x.currency, x.title);
if (v[0]) {
  const re = await revalidateAktgVoyage(v[0].code, v[0].currency || "USD");
  log("revalidate", v[0].code, JSON.stringify(re).slice(0, 1500));
}
