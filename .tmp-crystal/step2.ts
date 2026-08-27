import { bookingCall, bookingCapability, crystalBookingAudit } from "../src/lib/crystal/aktg-booking.server";
const L: string[] = [];
const log = (...a: unknown[]) => { const s = [new Date().toISOString(), ...a.map(x=>typeof x==="string"?x:JSON.stringify(x))].join(" "); L.push(s); console.log(s); };
log("capability", bookingCapability());
const voyage = "CSE-009-260830";
try {
  const av = await bookingCall<any>({ operation: "availability", query: { voyageNumber: voyage, priceTypeCod: "FIT", currency: "USD" } });
  const rows = av?.body?.availability ?? [];
  log("availability rows", rows.length, JSON.stringify(rows.slice(0,3)));
} catch (e) { log("availability FAIL", String(e)); }
try {
  const ns = await bookingCall<any>({ operation: "netfares", query: { voyageNumber: voyage, currency: "USD" } });
  const s = ns?.body?.suiteAvailability ?? [];
  log("netfare suites", s.length, JSON.stringify(s.slice(0,5)));
} catch (e) { log("netfares FAIL", String(e)); }
log("audit", crystalBookingAudit(10));
await Bun.write("/tmp/crystal/step2.log", L.join("\n"));
