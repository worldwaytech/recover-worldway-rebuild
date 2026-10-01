import { test } from "bun:test";
process.env.VIATOR_API_ENV = "sandbox";
test("dbg", async () => {
  const { viatorCheckAvailability } = await import("@/lib/viator/booking.server");
  const { validateHoldInput } = await import("@/lib/viator/checkout-contract");
  const h = validateHoldInput({ productCode: "5516ST5", travelDate: "2026-11-15", currency: "USD", paxMix: [{ ageBand: "ADULT", count: 2 }], productOptionCode: "TG2" });
  console.log("HOLD", JSON.stringify(h));
  console.log("AV", JSON.stringify(await viatorCheckAvailability(h)));
}, 60000);
