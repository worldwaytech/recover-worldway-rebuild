/**
 * Controlled Crystal PROD transaction test (audit script, not shipped code).
 * Read-only discovery first; a hold is only attempted when the supplier itself
 * returns an allocated suiteNumber. Any hold is released immediately.
 */
import {
  bookingCall,
  bookingCapability,
  crystalBookingAudit,
} from "../src/lib/crystal/aktg-booking.server";

const L: string[] = [];
const log = (...a: unknown[]) => {
  const s = [
    new Date().toISOString(),
    ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))),
  ].join(" ");
  L.push(s);
  console.log(s);
};

const VOYAGE = process.env["TEST_VOYAGE"] ?? "CSE-009-260830";

async function call(label: string, opts: Parameters<typeof bookingCall>[0]) {
  const t0 = Date.now();
  try {
    const res = await bookingCall<unknown>(opts);
    log(`PASS ${label} (${Date.now() - t0}ms)`, JSON.stringify(res).slice(0, 3000));
    return res as any;
  } catch (e) {
    log(`FAIL ${label} (${Date.now() - t0}ms)`, String(e));
    return null;
  }
}

log("capability", bookingCapability());
log("voyage under test", VOYAGE);

// 1. Live availability / fare revalidation
const av = await call("availability", {
  operation: "availability",
  query: { voyageNumber: VOYAGE, priceTypeCod: "FIT", currency: "USD" },
});

// 2. Net fare allocated suites (source of suiteNumber) — several documented shapes
const nsVariants: Record<string, Record<string, string>>[] = [
  { a: { voyageNumber: VOYAGE, currency: "USD" } },
  { b: { voyageNumber: VOYAGE, currency: "USD", priceTypeCod: "FIT" } },
  { c: { voyageNumber: VOYAGE, currency: "USD", numberOfGuests: "2" } },
];
let suiteNumber: number | undefined;
let suiteCategory: string | undefined;
for (const v of nsVariants) {
  const [name, query] = Object.entries(v)[0]!;
  const ns = await call(`netfares[${name}]`, { operation: "netfares", query });
  const rows: any[] = ns?.body?.suiteAvailability ?? ns?.suiteAvailability ?? [];
  const withNumber = rows.find((r) => Number(r?.suiteNumber) > 0);
  if (withNumber) {
    suiteNumber = Number(withNumber.suiteNumber);
    suiteCategory = String(withNumber.suiteCategory ?? withNumber.categoryCode ?? "");
    break;
  }
}
log("allocated suiteNumber discovered", { suiteNumber, suiteCategory });

// 3. Supporting reads
await call("pricetypes", { operation: "pricetypes" });
await call("promotions", { operation: "promotions", query: { voyageNumber: VOYAGE } });
await call("list", { operation: "list" });

// 4. Hold → verify → release, ONLY with a supplier-allocated suite number.
if (suiteNumber) {
  const idem = `wwl_prod_test_${Date.now().toString(36)}`;
  const holdBody = {
    voyageNumber: VOYAGE,
    currency: "USD",
    priceTypeCod: "FIT",
    suites: [{ suiteNumber, suiteCategory, numberOfGuests: 2 }],
  };
  log("hold request body", holdBody);
  const hold = await call("prebook(hold)", {
    operation: "prebook",
    body: holdBody,
    idempotencyKey: idem,
  });
  if (hold) {
    await call("netfares(verify hold)", {
      operation: "netfares",
      query: { voyageNumber: VOYAGE, currency: "USD" },
    });
    await call("suites(release hold)", { operation: "suites", body: holdBody });
    log("hold released immediately — no inventory left active");
  }
} else {
  log(
    "SKIPPED hold/unhold and booking lifecycle: supplier returned no allocated suiteNumber, " +
      "which is a mandatory field of VoyageSuiteRequest. Not invented.",
  );
}

log("audit", crystalBookingAudit(30));
await Bun.write("/tmp/crystal/step3.log", L.join("\n"));
