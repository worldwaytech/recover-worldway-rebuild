import type { ComponentKind, NormalizedComponent, SupplierCapability } from "./types";

export type BookingStatus = "Pending" | "Validating" | "Reserving" | "Reserved" | "Booking" | "Booked" | "Ticketed" | "Failed" | "Cancelled" | "Expired" | "Refunded";
export type PaymentStatus = "unpaid" | "pending" | "authorized" | "captured" | "failed" | "partially_refunded" | "refunded";
export type BookingScope = "booking:read" | "booking:write" | "payment:write" | "booking:modify" | "booking:cancel" | "booking:refund" | "booking:document" | "booking:notify";

export interface BookingActor { tenantId: string; actorId: string; scopes: readonly BookingScope[]; customerId?: string; }
export interface BookingComponent { id: string; kind: ComponentKind; supplierKey: string; externalId: string; title: string; amount: number; currency: string; }
export interface BookingRequest { idempotencyKey: string; tenantId: string; customerId: string; packageId: string; currency: string; total: number; components: BookingComponent[]; acceptedPriceVersion: string; }
export interface BookingRecord { id: string; tenantId: string; customerId: string; packageId: string; status: BookingStatus; paymentStatus: PaymentStatus; currency: string; total: number; idempotencyKey: string; acceptedPriceVersion: string; componentIds: string[]; providerRefs: Record<string,string>; createdAt: string; updatedAt: string; failureReason?: string; refundAmount?: number; }
export interface BookingEvent { sequence: number; bookingId: string; tenantId: string; type: "booking.created"|"booking.validated"|"booking.reserved"|"payment.authorized"|"payment.captured"|"booking.booked"|"booking.ticketed"|"booking.modified"|"booking.cancelled"|"booking.refunded"|"booking.failed"|"booking.expired"|"booking.compensated"|"document.issued"|"notification.sent"; status: BookingStatus; occurredAt: string; actorId: string; idempotencyKey: string; detail: Record<string,unknown>; }
export interface RevalidationResult { available: boolean; price: number; currency: string; priceVersion: string; expiresAt?: string; }
export interface ReservationResult { reservationRef: string; expiresAt?: string; }
export interface BookingResult { providerRef: string; ticketable: boolean; }
export interface ModificationResult { total: number; currency: string; material: boolean; providerRef?: string; }
export interface CancellationResult { refundableAmount: number; currency: string; }

export interface SupplierAdapter {
  supplierKey: string;
  capabilities: readonly SupplierCapability[];
  revalidate(component: BookingComponent, expected: {currency:string; acceptedPriceVersion:string}): Promise<RevalidationResult>;
  reserve(component: BookingComponent): Promise<ReservationResult>;
  release(component: BookingComponent, reservationRef: string): Promise<void>;
  book(component: BookingComponent, reservationRef: string): Promise<BookingResult>;
  cancel(component: BookingComponent, providerRef: string): Promise<CancellationResult>;
  modify?(component: BookingComponent, providerRef: string, request: Record<string,unknown>): Promise<ModificationResult>;
  status?(component: BookingComponent, providerRef: string): Promise<"confirmed"|"ticketed"|"failed">;
}
export interface PaymentIntent { id:string; provider:"wallet"|"razorpay"|"paypal"|"bank_transfer"; amount:number; currency:string; status:PaymentStatus; gatewayReference?:string; }
export interface PaymentAdapter { provider:PaymentIntent["provider"]; authorize(input:{bookingId:string;amount:number;currency:string;idempotencyKey:string}):Promise<PaymentIntent>; capture(intent:PaymentIntent):Promise<PaymentIntent>; refund(input:{bookingId:string;payment:PaymentIntent;amount:number;idempotencyKey:string}):Promise<PaymentIntent>; }
export interface BookingDocuments { confirmation?:string; voucher?:string; invoice?:string; receipt?:string; }
export interface BookingCommunication { send(input:{booking:BookingRecord; event:BookingEvent["type"]; documents:BookingDocuments}):Promise<void>; }

const NEXT: Record<BookingStatus, readonly BookingStatus[]> = { Pending:["Validating","Expired"], Validating:["Reserving","Failed"], Reserving:["Reserved","Failed"], Reserved:["Booking","Cancelled","Expired","Failed"], Booking:["Booked","Failed"], Booked:["Ticketed","Cancelled","Failed"], Ticketed:["Cancelled","Failed"], Failed:[], Cancelled:["Refunded"], Expired:[], Refunded:[] };
const CAP: Record<string,SupplierCapability> = { validate:"revalidate", reserve:"hold", book:"book", cancel:"cancel", modify:"modify", refund:"refund", ticket:"ticket" };
function transitionAllowed(a:BookingStatus,b:BookingStatus){ if(!NEXT[a].includes(b)) throw new Error("Invalid booking transition: "+a+" -> "+b); }
function positive(n:number,label:string){ if(!Number.isFinite(n)||n<=0) throw new Error(label+" must be greater than zero"); }

export class BookingOrchestrator {
  private bookings=new Map<string,BookingRecord>();
  private idempotency=new Map<string,string>();
  private payments=new Map<string,PaymentIntent>();
  private reservations=new Map<string,ReservationResult>();
  private providers=new Map<string,SupplierAdapter>();
  private events:BookingEvent[]=[];
  private documents=new Map<string,BookingDocuments>();
  constructor(private readonly adapters:readonly SupplierAdapter[], private readonly paymentAdapters:readonly PaymentAdapter[], private readonly communication?:BookingCommunication, private readonly now=()=>new Date().toISOString()){ for(const a of adapters)this.providers.set(a.supplierKey,a); }
  get(actor:BookingActor,id:string){ return this.authorize(actor,id,"booking:read"); }
  getEvents(actor:BookingActor,id:string){ const b=this.authorize(actor,id,"booking:read"); return this.events.filter(e=>e.bookingId===b.id); }
  getDocuments(actor:BookingActor,id:string){ const b=this.authorize(actor,id,"booking:read"); return {...(this.documents.get(b.id)||{})}; }

  async createAndBook(actor:BookingActor,input:BookingRequest,paymentProvider:PaymentIntent["provider"]):Promise<BookingRecord>{
    this.assertTenant(actor,input.tenantId); this.require(actor,"booking:write"); this.require(actor,"payment:write"); positive(input.total,"Booking total");
    if(!input.idempotencyKey) throw new Error("Idempotency key is required"); if(!input.components.length) throw new Error("At least one booking component is required");
    const idem=input.tenantId+":"+input.idempotencyKey; const prior=this.idempotency.get(idem); if(prior) return this.authorize(actor,prior,"booking:read");
    const id="WWB-"+input.tenantId+"-"+input.idempotencyKey; const now=this.now();
    const booking:BookingRecord={id,tenantId:input.tenantId,customerId:input.customerId,packageId:input.packageId,status:"Pending",paymentStatus:"unpaid",currency:input.currency,total:input.total,idempotencyKey:input.idempotencyKey,acceptedPriceVersion:input.acceptedPriceVersion,componentIds:input.components.map(c=>c.id),providerRefs:{},createdAt:now,updatedAt:now};
    this.bookings.set(id,booking); this.idempotency.set(idem,id); this.append(actor,booking,"booking.created",{packageId:input.packageId});
    try {
      this.move(actor,booking,"Validating");
      const checks=await Promise.all(input.components.map(c=>this.validate(c,input)));
      const total=checks.reduce((s,x)=>s+x.price,0);
      if(checks.some(x=>!x.available||x.currency!==input.currency)) throw new Error("Supplier validation failed: availability or currency changed");
      if(Math.abs(total-input.total)>Math.max(.01,input.total*.0001)) throw new Error("Supplier validation failed: price changed after acceptance");
      this.move(actor,booking,"Reserving");
      for(const c of input.components){ const a=this.adapter(c); this.requireCapability(a,"hold"); const h=await a.reserve(c); this.reservations.set(id+":"+c.id,h); }
      this.move(actor,booking,"Reserved");
      const pa=this.paymentAdapter(paymentProvider); const p=await pa.authorize({bookingId:id,amount:input.total,currency:input.currency,idempotencyKey:input.idempotencyKey+":payment"});
      this.payments.set(id,p); booking.paymentStatus=p.status; if(p.status!=="authorized"&&p.status!=="captured") throw new Error("Payment authorization failed"); this.append(actor,booking,"payment.authorized",{provider:paymentProvider,paymentId:p.id});
      const captured=p.status==="captured"?p:await pa.capture(p); if(captured.status!=="captured") throw new Error("Payment capture failed"); this.payments.set(id,captured); booking.paymentStatus="captured"; this.append(actor,booking,"payment.captured",{paymentId:captured.id});
      this.move(actor,booking,"Booking");
      try { for(const c of input.components){ const a=this.adapter(c); this.requireCapability(a,"book"); const h=this.reservations.get(id+":"+c.id); if(!h) throw new Error("Missing reservation for "+c.id); const result=await a.book(c,h.reservationRef); booking.providerRefs[c.id]=result.providerRef; } }
      catch(e){ await this.compensate(actor,booking,input.components,pa,e); throw e; }
      this.move(actor,booking,"Booked");
      let ticketed=true; for(const c of input.components){ const a=this.adapter(c); if(!a.status||!a.capabilities.includes("ticket")){ticketed=false;continue;} if(await a.status(c,booking.providerRefs[c.id])!=="ticketed") ticketed=false; }
      if(ticketed)this.move(actor,booking,"Ticketed");
      await this.document(actor,booking,"confirmation"); await this.document(actor,booking,"invoice"); await this.document(actor,booking,"receipt"); await this.notify(actor,booking);
      return {...booking,providerRefs:{...booking.providerRefs}};
    } catch(e){ if(!["Failed","Cancelled","Refunded","Booked","Ticketed"].includes(booking.status)) this.move(actor,booking,"Failed",{reason:this.message(e)}); throw e; }
  }

  async cancel(actor:BookingActor,id:string,reason?:string){ const b=this.authorize(actor,id,"booking:cancel"); if(!["Reserved","Booked","Ticketed"].includes(b.status)) throw new Error("Cannot cancel booking in "+b.status); let refundable=0;
    for(const cid of b.componentIds){ const c=this.component(b,cid); const a=this.adapter(c); const ref=b.providerRefs[cid]; if(ref&&a.capabilities.includes("cancel")) refundable+=(await a.cancel(c,ref)).refundableAmount; else {const h=this.reservations.get(id+":"+cid); if(h)await a.release(c,h.reservationRef);} }
    this.move(actor,b,"Cancelled",{reason:reason||null,refundable}); if(refundable>0&&b.paymentStatus==="captured") await this.refund(actor,b,refundable); await this.notify(actor,b); return {...b}; }

  async refund(actor:BookingActor,b:BookingRecord,amount=b.total){ this.require(actor,"booking:refund"); this.assertTenant(actor,b.tenantId); positive(amount,"Refund amount"); if(amount>b.total)throw new Error("Refund exceeds booking total"); const p=this.payments.get(b.id); if(!p||p.status!=="captured")throw new Error("No captured payment available for refund"); const a=this.paymentAdapter(p.provider); const r=await a.refund({bookingId:b.id,payment:p,amount,idempotencyKey:b.id+":refund:"+amount}); this.payments.set(b.id,r); b.refundAmount=(b.refundAmount||0)+amount; b.paymentStatus=amount===b.total?"refunded":"partially_refunded"; if(amount===b.total)this.move(actor,b,"Refunded",{amount});else this.append(actor,b,"booking.refunded",{amount,partial:true}); await this.document(actor,b,"receipt"); await this.notify(actor,b); return {...b}; }

  async modify(actor:BookingActor,id:string,request:Record<string,unknown>){ const b=this.authorize(actor,id,"booking:modify"); if(!["Booked","Ticketed"].includes(b.status))throw new Error("Only booked or ticketed bookings can be modified"); let changed=0; let total=0; let currency=b.currency;
    for(const cid of b.componentIds){const c=this.component(b,cid);const a=this.adapter(c);const ref=b.providerRefs[cid];if(!ref||!a.modify||!a.capabilities.includes("modify"))continue;const r=await a.modify(c,ref,request);changed++;total+=r.total;currency=r.currency;}
    if(!changed)throw new Error("No supplier supports the requested modification"); b.total=total;b.currency=currency;b.updatedAt=this.now();this.append(actor,b,"booking.modified",{request});await this.notify(actor,b);return {...b}; }

  private async validate(c:BookingComponent,input:BookingRequest){const a=this.adapter(c);this.requireCapability(a,"revalidate");return a.revalidate(c,{currency:input.currency,acceptedPriceVersion:input.acceptedPriceVersion});}
  private async compensate(actor:BookingActor,b:BookingRecord,components:BookingComponent[],pa:PaymentAdapter,cause:unknown){ for(const c of components){const a=this.adapter(c);try{const ref=b.providerRefs[c.id];if(ref&&a.capabilities.includes("cancel"))await a.cancel(c,ref);const h=this.reservations.get(b.id+":"+c.id);if(h)await a.release(c,h.reservationRef);}catch{}} const p=this.payments.get(b.id);if(p?.status==="captured"){try{const r=await pa.refund({bookingId:b.id,payment:p,amount:b.total,idempotencyKey:b.id+":compensation"});this.payments.set(b.id,r);b.paymentStatus="refunded";}catch{}} b.failureReason=this.message(cause);this.append(actor,b,"booking.compensated",{reason:b.failureReason,paymentStatus:b.paymentStatus}); }
  private async document(actor:BookingActor,b:BookingRecord,k:keyof BookingDocuments){this.require(actor,"booking:document");const d=this.documents.get(b.id)||{};if(d[k])return;const ref="WW"+k.slice(0,3).toUpperCase()+"-"+b.id+"-"+(this.events.length+1);this.documents.set(b.id,{...d,[k]:ref});this.append(actor,b,"document.issued",{kind:k,reference:ref});}
  private async notify(actor:BookingActor,b:BookingRecord){if(!this.communication)return;this.require(actor,"booking:notify");await this.communication.send({booking:{...b},event:"notification.sent",documents:this.getDocuments(actor,b.id)});this.append(actor,b,"notification.sent",{});}
  private move(actor:BookingActor,b:BookingRecord,to:BookingStatus,detail:Record<string,unknown>={}){transitionAllowed(b.status,to);b.status=to;b.updatedAt=this.now();const map:Record<string,BookingEvent["type"]>={Validating:"booking.validated",Reserved:"booking.reserved",Booked:"booking.booked",Ticketed:"booking.ticketed",Cancelled:"booking.cancelled",Refunded:"booking.refunded",Failed:"booking.failed",Expired:"booking.expired"};const type=map[to];if(type)this.append(actor,b,type,detail);}
  private append(actor:BookingActor,b:BookingRecord,type:BookingEvent["type"],detail:Record<string,unknown>){this.events.push({sequence:this.events.length+1,bookingId:b.id,tenantId:b.tenantId,type,status:b.status,occurredAt:this.now(),actorId:actor.actorId,idempotencyKey:b.idempotencyKey,detail});}
  private authorize(actor:BookingActor,id:string,scope:BookingScope){this.require(actor,scope);const b=this.bookings.get(id);if(!b)throw new Error("Booking not found");this.assertTenant(actor,b.tenantId);if(actor.customerId&&actor.customerId!==b.customerId)throw new Error("Booking access denied");return b;}
  private require(actor:BookingActor,scope:BookingScope){if(!actor.scopes.includes(scope))throw new Error("Missing scope: "+scope);}
  private assertTenant(actor:BookingActor,tenantId:string){if(actor.tenantId!==tenantId)throw new Error("Tenant isolation violation");}
  private adapter(c:BookingComponent){const a=this.providers.get(c.supplierKey);if(!a)throw new Error("Supplier adapter not registered: "+c.supplierKey);return a;}
  private requireCapability(a:SupplierAdapter,c:SupplierCapability){if(!a.capabilities.includes(c))throw new Error("Supplier "+a.supplierKey+" lacks "+c+" capability");}
  private paymentAdapter(p:PaymentIntent["provider"]){const a=this.paymentAdapters.find(x=>x.provider===p);if(!a)throw new Error("Payment adapter not registered: "+p);return a;}
  private component(b:BookingRecord,id:string):BookingComponent{return{id,kind:"activity",supplierKey:b.providerRefs[id]?.split(":")[0]||"",externalId:id,title:id,amount:b.total/Math.max(1,b.componentIds.length),currency:b.currency};}
  private message(e:unknown){return e instanceof Error?e.message:"Booking orchestration failed";}
}

export function bookingReadiness(components:readonly NormalizedComponent[],caps:ReadonlyMap<string,readonly SupplierCapability[]>) { const reasons:string[]=[]; for(const c of components){const x=caps.get(c.supplierKey)||[];if(!x.includes("revalidate")&&!x.includes("availability"))reasons.push(c.id+": supplier revalidation capability missing");if(!x.includes("book"))reasons.push(c.id+": supplier booking capability missing");} return {ready:reasons.length===0,reasons}; }

export function postBookingModificationReadiness(
  status: BookingStatus,
  components: readonly BookingComponent[],
  capabilities: ReadonlyMap<string, readonly SupplierCapability[]>,
  requestedComponentIds: readonly string[],
) {
  const blockers: string[] = [];
  if (status !== "Booked" && status !== "Ticketed") {
    blockers.push("Booking must be Booked or Ticketed before modification.");
  }

  const requested = requestedComponentIds.length
    ? [...new Set(requestedComponentIds)]
    : components.map((component) => component.id);
  const byId = new Map(components.map((component) => [component.id, component]));

  for (const id of requested) {
    const component = byId.get(id);
    if (!component) {
      blockers.push(id + ": booking component not found");
      continue;
    }
    const caps = capabilities.get(component.supplierKey) ?? [];
    if (!caps.includes("modify")) blockers.push(id + ": supplier modification capability missing");
    if (!caps.includes("revalidate") && !caps.includes("availability")) {
      blockers.push(id + ": supplier revalidation capability missing");
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    requiresRevalidation: true as const,
    requiresCommercialRequote: true as const,
    requiresApproval: true as const,
  };
}

export function bookingStateTransitions():Readonly<Record<BookingStatus,readonly BookingStatus[]>> { return NEXT; }

export function isBookingCapabilityReady(capabilities:readonly SupplierCapability[],capability:SupplierCapability){return capabilities.includes(capability);}

export function requiredBookingCapabilities():readonly SupplierCapability[]{return ["revalidate","hold","book"];}