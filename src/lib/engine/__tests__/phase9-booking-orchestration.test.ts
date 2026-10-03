import { describe, expect, it } from "vitest";
import { BookingOrchestrator, postBookingModificationReadiness, type BookingActor, type BookingComponent, type PaymentAdapter, type PaymentIntent, type SupplierAdapter } from "../booking-orchestration";

const actor:BookingActor={tenantId:"t1",actorId:"u1",customerId:"c1",scopes:["booking:read","booking:write","payment:write","booking:cancel","booking:refund","booking:modify","booking:document","booking:notify"]};
const component:BookingComponent={id:"flight-1",kind:"flight",supplierKey:"demo",externalId:"F1",title:"Demo flight",amount:100,currency:"USD"};

function payment():PaymentAdapter{
  return {provider:"razorpay",async authorize(i){return{id:"pay-1",provider:"razorpay",amount:i.amount,currency:i.currency,status:"authorized"};},async capture(i){return{...i,status:"captured"};},async refund(i){return{...i.payment,status:i.amount===i.payment.amount?"refunded":"partially_refunded"};}};
}
function supplier(failBook=false):SupplierAdapter{
  return {supplierKey:"demo",capabilities:["revalidate","hold","book","cancel","modify","ticket","refund"],
    async revalidate(c){return{available:true,price:c.amount,currency:c.currency,priceVersion:"v1"};},
    async reserve(){return{reservationRef:"hold-1"};},
    async release(){},
    async book(){if(failBook)throw new Error("supplier booking failed");return{providerRef:"demo:ref-1",ticketable:true};},
    async cancel(){return{refundableAmount:100,currency:"USD"};},
    async modify(c){return{total:c.amount,currency:c.currency,material:false};},
    async status(){return"ticketed";},
  };
}
function input(){return{idempotencyKey:"idem-1",tenantId:"t1",customerId:"c1",packageId:"p1",currency:"USD",total:100,components:[component],acceptedPriceVersion:"v1"};}

describe("Phase 9 booking orchestration",()=>{
  it("executes validate -> reserve -> payment -> book -> ticket and is idempotent",async()=>{
    const o=new BookingOrchestrator([supplier()],[payment()],undefined,()=> "2026-10-03T00:00:00.000Z");
    const first=await o.createAndBook(actor,input(),"razorpay");
    const second=await o.createAndBook(actor,input(),"razorpay");
    expect(first.status).toBe("Ticketed"); expect(first.paymentStatus).toBe("captured"); expect(second.id).toBe(first.id);
    expect(o.getEvents(actor,first.id).map(e=>e.type)).toEqual(expect.arrayContaining(["booking.created","booking.validated","booking.reserved","payment.authorized","payment.captured","booking.booked","booking.ticketed"]));
  });
  it("enforces tenant isolation and scope gates",async()=>{
    const o=new BookingOrchestrator([supplier()],[payment()]);
    const b=await o.createAndBook(actor,input(),"razorpay");
    expect(()=>o.get({...actor,tenantId:"other"},b.id)).toThrow("Tenant isolation violation");
    expect(()=>o.get({...actor,scopes:["booking:write"]},b.id)).toThrow("Missing scope: booking:read");
  });
  it("compensates supplier reservations and captured payment on booking failure",async()=>{
    const o=new BookingOrchestrator([supplier(true)],[payment()]);
    await expect(o.createAndBook(actor,input(),"razorpay")).rejects.toThrow("supplier booking failed");
    const events=o.getEvents(actor,"WWB-t1-idem-1");
    expect(events.some(e=>e.type==="booking.compensated")).toBe(true);
    expect(events.some(e=>e.detail.paymentStatus==="refunded")).toBe(true);
  });
  it("supports cancellation and refund without deleting the event history",async()=>{
    const o=new BookingOrchestrator([supplier()],[payment()]);
    const b=await o.createAndBook(actor,input(),"razorpay");
    const cancelled=await o.cancel(actor,b.id,"customer request");
    expect(cancelled.status).toBe("Refunded"); expect(cancelled.paymentStatus).toBe("refunded");
    expect(o.getEvents(actor,b.id).some(e=>e.type==="booking.cancelled")).toBe(true);
    expect(o.getEvents(actor,b.id).some(e=>e.type==="booking.refunded")).toBe(true);
  });
  it("keeps post-booking modification readiness deterministic and fail-closed",async()=>{
    const o=new BookingOrchestrator([supplier()],[payment()]);
    const b=await o.createAndBook(actor,input(),"razorpay");
    const ready=postBookingModificationReadiness(
      b.status,
      [component],
      new Map([["demo", supplier().capabilities]]),
      ["flight-1"],
    );
    expect(ready.ready).toBe(true);
    expect(ready.requiresRevalidation).toBe(true);
    expect(ready.requiresCommercialRequote).toBe(true);
    expect(ready.requiresApproval).toBe(true);

    const blocked=postBookingModificationReadiness(
      "Pending",
      [component],
      new Map([["demo", ["book"] as const]]),
      ["flight-1"],
    );
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      "Booking must be Booked or Ticketed before modification.",
      "flight-1: supplier modification capability missing",
      "flight-1: supplier revalidation capability missing",
    ]));
  });
  it("requires fresh supplier validation and preserves the accepted price",async()=>{
    const s=supplier(); s.revalidate=async()=>({available:true,price:101,currency:"USD",priceVersion:"v2"});
    const o=new BookingOrchestrator([s],[payment()]);
    await expect(o.createAndBook(actor,input(),"razorpay")).rejects.toThrow("price changed after acceptance");
  });
});