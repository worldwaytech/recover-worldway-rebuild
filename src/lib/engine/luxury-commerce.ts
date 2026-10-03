import type { ComponentKind, Money, NormalizedComponent, TripRequirements } from "./types";

export type LuxuryProductKind = "private_jet" | "empty_leg" | "luxury_hotel" | "luxury_villa" | "yacht" | "luxury_cruise" | "luxury_rail" | "chauffeur" | "bespoke_experience" | "vip_airport_service";
export type AviationLegType = "charter" | "empty_leg" | "shared_private";
export type HighValueRiskLevel = "standard" | "elevated" | "enhanced_review";

export interface AircraftProfile {
  id: string; manufacturer: string; model: string; category: "very_light"|"light"|"midsize"|"super_midsize"|"heavy"|"ultra_long_range";
  seats: number; rangeNm?: number; cabinWidthM?: number; baggageKg?: number;
  onboardWifi?: boolean; lieFlat?: boolean; crewIncluded?: boolean;
  operatorKey: string; certificationReference?: string;
}

export interface AviationLeg {
  id: string; type: AviationLegType; aircraft: AircraftProfile;
  origin: string; destination: string; departureAt: string; arrivalAt: string;
  price: Money; emptyLegDiscountPercent?: number; availabilityExpiresAt?: string;
  repositioningRequired?: boolean; carbonKg?: number;
}

export interface LuxuryServiceRequirement {
  airportMeetAndAssist?: boolean; vipLounge?: boolean; privateTransfer?: boolean;
  chauffeur?: boolean; bespokeExperience?: boolean; yacht?: boolean; villa?: boolean;
  privateAviation?: boolean; dietaryOrAccessibility?: string[];
}

export interface LuxuryCommerceRequest {
  requirements: TripRequirements;
  services?: LuxuryServiceRequirement;
  minimumQuality?: number;
  maxBudget?: Money;
  privateAviationOnly?: boolean;
  preferredAircraftCategories?: AircraftProfile["category"][];
}

export interface LuxuryCandidate {
  id: string; kind: LuxuryProductKind; title: string; component?: NormalizedComponent;
  price: Money; quality: number; exclusivity: number; serviceLevel: number;
  supplierKey: string; refundable: boolean; bookable: boolean;
  riskLevel?: HighValueRiskLevel; evidence?: string[];
}

export interface LuxuryPackage {
  id: string; candidates: LuxuryCandidate[]; total: Money;
  luxuryScore: number; exclusivityScore: number; serviceScore: number;
  highValueRisk: HighValueRiskLevel; requiresHumanReview: boolean;
  bookable: boolean; reasons: string[];
}

export interface AviationComparison {
  legId: string; aircraftId: string; operatorKey: string; category: AircraftProfile["category"];
  seats: number; durationMinutes: number; price: Money; pricePerSeat: Money;
  rangeAdequate: boolean; preferredCategory: boolean; emptyLeg: boolean;
}

function clamp(n:number){return Math.max(0,Math.min(1,n));}
function durationMinutes(a:string,b:string){return Math.max(0,Math.round((Date.parse(b)-Date.parse(a))/60000));}
function risk(price:Money,services:LuxuryServiceRequirement|undefined):HighValueRiskLevel{
  const high=price.amount>=50000 || !!services?.privateAviation || !!services?.yacht;
  const enhanced=(price.amount>=50000 && !!services?.privateAviation) || price.amount>=150000 || !!services?.yacht;
  return enhanced?"enhanced_review":high?"elevated":"standard";
}

export function compareAircraft(legs:readonly AviationLeg[], request:LuxuryCommerceRequest):AviationComparison[]{
  return legs.map(leg=>{
    const duration=durationMinutes(leg.departureAt,leg.arrivalAt);
    const rangeAdequate=leg.aircraft.rangeNm==null || leg.aircraft.rangeNm>0;
    const preferred=request.preferredAircraftCategories?.includes(leg.aircraft.category)??false;
    return {legId:leg.id,aircraftId:leg.aircraft.id,operatorKey:leg.aircraft.operatorKey,category:leg.aircraft.category,seats:leg.aircraft.seats,durationMinutes:duration,price:leg.price,pricePerSeat:{amount:leg.price.amount/Math.max(1,leg.aircraft.seats),currency:leg.price.currency},rangeAdequate,preferredCategory:preferred,emptyLeg:leg.type==="empty_leg"};
  }).sort((a,b)=>Number(b.preferredCategory)-Number(a.preferredCategory)||Number(b.emptyLeg)-Number(a.emptyLeg)||a.price.amount-b.price.amount||a.aircraftId.localeCompare(b.aircraftId));
}

export function selectEmptyLegs(legs:readonly AviationLeg[],now:string):AviationLeg[]{
  return legs.filter(x=>x.type==="empty_leg" && (!x.availabilityExpiresAt || Date.parse(x.availabilityExpiresAt)>=Date.parse(now)) && x.price.amount>0 && !x.repositioningRequired).sort((a,b)=>a.price.amount-b.price.amount);
}

export function scoreLuxuryCandidate(candidate:LuxuryCandidate,requirements:TripRequirements):number{
  const quality=clamp(candidate.quality/5); const exclusivity=clamp(candidate.exclusivity/5); const service=clamp(candidate.serviceLevel/5);
  const luxuryFit=1-Math.abs(candidate.quality-requirements.luxuryLevel)/5;
  const budgetFit=requirements.budget?.amount ? clamp(1-candidate.price.amount/requirements.budget.amount) : .5;
  return .35*quality+.25*exclusivity+.2*service+.15*clamp(luxuryFit)+.05*budgetFit;
}

export function assessHighValueRisk(total:Money,services?:LuxuryServiceRequirement):HighValueRiskLevel{return risk(total,services);}

export function composeLuxuryPackage(request:LuxuryCommerceRequest,candidates:readonly LuxuryCandidate[]):LuxuryPackage{
  const reasons:string[]=[];
  const selected=candidates.filter(c=>c.bookable && c.quality>=(request.minimumQuality??request.requirements.luxuryLevel));
  const kinds=new Set(selected.map(c=>c.kind));
  const required:[LuxuryProductKind,boolean][]=[["private_jet",!!request.services?.privateAviation],["yacht",!!request.services?.yacht],["luxury_villa",!!request.services?.villa],["chauffeur",!!request.services?.chauffeur],["bespoke_experience",!!request.services?.bespokeExperience],["vip_airport_service",!!request.services?.airportMeetAndAssist]];
  for(const [kind,needed] of required) if(needed&&!kinds.has(kind)) reasons.push("Required luxury service unavailable: "+kind);
  const sorted=[...selected].sort((a,b)=>scoreLuxuryCandidate(b,request.requirements)-scoreLuxuryCandidate(a,request.requirements)||a.id.localeCompare(b.id));
  const chosen:LuxuryCandidate[]=[]; const seen=new Set<LuxuryProductKind>();
  for(const c of sorted){ if(seen.has(c.kind))continue; chosen.push(c);seen.add(c.kind); }
  const currency=request.maxBudget?.currency||request.requirements.budget?.currency||chosen[0]?.price.currency||"USD";
  const totalAmount=chosen.filter(c=>c.price.currency===currency).reduce((s,c)=>s+c.price.amount,0);
  if(request.maxBudget && totalAmount>request.maxBudget.amount) reasons.push("Luxury package exceeds configured budget");
  if(request.privateAviationOnly && !chosen.some(c=>c.kind==="private_jet"||c.kind==="empty_leg")) reasons.push("Private aviation inventory required");
  const n=chosen.length||1; const luxuryScore=chosen.reduce((s,c)=>s+scoreLuxuryCandidate(c,request.requirements),0)/n;
  const exclusivityScore=chosen.reduce((s,c)=>s+clamp(c.exclusivity/5),0)/n; const serviceScore=chosen.reduce((s,c)=>s+clamp(c.serviceLevel/5),0)/n;
  const highValueRisk=assessHighValueRisk({amount:totalAmount,currency},request.services);
  const requiresHumanReview=highValueRisk!=="standard" || reasons.length>0 || chosen.some(c=>c.riskLevel==="enhanced_review");
  return {id:"LUX-"+request.requirements.origin+"-"+request.requirements.destinations.join("-"),candidates:chosen,total:{amount:totalAmount,currency},luxuryScore,exclusivityScore,serviceScore,highValueRisk,requiresHumanReview,bookable:reasons.length===0&&!requiresHumanReview,reasons};
}

export function luxuryComponentAdapter(candidate:LuxuryCandidate,now:string):NormalizedComponent|null{
  if(!candidate.component)return null;
  if(Date.parse(candidate.component.end.at)<Date.parse(now))return null;
  return {...candidate.component,quality:Math.max(candidate.component.quality??0,candidate.quality)};
}

export function validateAviationLeg(leg:AviationLeg,now:string):string[]{
  const issues:string[]=[]; if(leg.aircraft.seats<1)issues.push("aircraft seat capacity invalid");
  if(Date.parse(leg.arrivalAt)<=Date.parse(leg.departureAt))issues.push("arrival must follow departure");
  if(Date.parse(leg.departureAt)<=Date.parse(now))issues.push("departure is not in the future");
  if(leg.price.amount<=0)issues.push("aviation price unavailable");
  if(leg.type==="empty_leg"&&leg.repositioningRequired)issues.push("empty leg requires repositioning");
  return issues;
}

export function luxuryProductKinds():readonly LuxuryProductKind[]{return ["private_jet","empty_leg","luxury_hotel","luxury_villa","yacht","luxury_cruise","luxury_rail","chauffeur","bespoke_experience","vip_airport_service"];}