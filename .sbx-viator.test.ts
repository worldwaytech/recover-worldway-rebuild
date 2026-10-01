import { mock, test } from "bun:test";
process.env.VIATOR_API_ENV = "sandbox";
let captured: any = null;
mock.module("@/lib/up17/booking.server", () => ({
  createIntent: async (i: any) => { captured = i; return { bookingId: "00000000-0000-0000-0000-000000000000", reference: "WWB-SANDBOXTEST", amountMinor: Math.round(i.amount * 100), currency: i.currency, expiresAt: "" }; },
}));
test("sandbox app-level", async () => {
  const { prepareViatorPaidBooking, bookViatorActivity, activityVoucherSummary } = await import("@/lib/viator/paid-booking.server");
  const base = { productCode: "5516ST5", productTitle: "Sandbox test", travelDate: "2026-11-15", currency: "USD", paxMix: [{ ageBand: "ADULT", count: 2 }], productOptionCode: "TG2",
    booker: { firstName: "Sandbox", lastName: "Tester", email: "worldwaytravelsgroup@gmail.com", phone: "+919999999999" },
    travellers: [{ firstName: "Sandbox", lastName: "Tester" }, { firstName: "Second", lastName: "Tester" }],
    bookingQuestionAnswers: [{ question: "WEIGHT", answer: "70", travelerNum: 1, unit: "kg" }, { question: "WEIGHT", answer: "72", travelerNum: 2, unit: "kg" }] };
  const noGuide = await prepareViatorPaidBooking("test-user", base as any);
  console.log("NO_GUIDE", JSON.stringify(noGuide));
  const r = await prepareViatorPaidBooking("test-user", { ...base, languageGuide: { type: "GUIDE", language: "en" } } as any);
  console.log("PREPARE", JSON.stringify(r));
  if (!r.ok) return;
  const p = captured.payload;
  console.log("PRICING", JSON.stringify(p.pricing), "CART", p.cartRef, p.viatorBookingRef, p.partnerBookingRef);
  const b = await bookViatorActivity(p);
  console.log("BOOK", JSON.stringify(b));
  console.log("VOUCHER_SUMMARY", JSON.stringify(activityVoucherSummary(p)));
  const { viatorBookingStatus } = await import("@/lib/viator/booking.server");
  console.log("STATUS", JSON.stringify(await viatorBookingStatus({ partnerBookingRef: p.partnerBookingRef })));
  const pb = await import("@/lib/viator/post-booking.server");
  const q = await pb.viatorCancelQuote(p.viatorBookingRef); console.log("QUOTE", JSON.stringify(q));
  const reasons = await pb.viatorCancelReasons("CUSTOMER");
  const reason = reasons.reasons.find((x) => x.code === "Customer_Service.I_canceled_my_entire_trip") ?? reasons.reasons[0];
  console.log("REASON", reasons.ok, reason?.code);
  console.log("CANCEL", JSON.stringify(await pb.viatorCancelBooking(p.viatorBookingRef, reason!.code)));
  console.log("STATUS2", JSON.stringify(await viatorBookingStatus({ bookingRef: p.viatorBookingRef })));
}, 400000);
