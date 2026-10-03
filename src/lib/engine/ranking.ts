// Explainable ranking of complete packages + booking-readiness gate.
import { checkChronology, checkTripWindow } from "./chronology";
import { bookingBlockers } from "./capabilities";
import { packageOptimizationMetrics, paretoFrontier, resolveRankingWeights, type PackageOptimizationMetrics, type RankingProfile } from "./optimization";
import type { AuditIssue, NormalizedComponent, SupplierRegistration, TripRequirements } from "./types";

export interface ScoreFactor { factor:string; weight:number; value:number; }
export interface RankedPackage { id:string; items:NormalizedComponent[]; score:number; factors:ScoreFactor[]; issues:AuditIssue[]; bookable:boolean; optimizationMetrics:PackageOptimizationMetrics; paretoOptimal:boolean; }

export function auditPackage(items:NormalizedComponent[], registry:Map<string,SupplierRegistration>):AuditIssue[] { const issues=checkChronology(items); for(const c of items){const reg=registry.get(c.supplierKey);const blockers=bookingBlockers(reg);if(blockers.length)issues.push({code:"supplier-not-bookable",severity:"warning",componentIds:[c.id],message:c.title+" is enquiry-only (not production-certified: "+blockers.join(", ")+")."});if(!c.revalidatedAt)issues.push({code:"not-revalidated",severity:"warning",componentIds:[c.id],message:c.title+" has not been revalidated live."});} return issues; }

export function rankPackages(candidates:{id:string;items:NormalizedComponent[];total:number;marginAmount?:number}[],req:TripRequirements,registry:Map<string,SupplierRegistration>,profile?:RankingProfile):RankedPackage[] {
 const totals=candidates.map(c=>c.total); const min=Math.min(...totals); const max=Math.max(...totals); const weights=resolveRankingWeights(profile); const paretoIds=new Set(paretoFrontier(candidates.map(c=>({id:c.id,items:c.items,total:c.total,marginAmount:c.marginAmount})),req,registry,profile).map(c=>c.id));
 return candidates.map(c=>{
  const issues=[...auditPackage(c.items,registry),...checkTripWindow(c.items,req)]; const errors=issues.filter(i=>i.severity==="error").length;
  const quality=avg(c.items.map(i=>(i.quality??3)/5)); const luxuryFit=1-Math.abs(quality*5-req.luxuryLevel)/5; const price=max===min?1:1-(c.total-min)/(max-min); const budget=req.budget?(c.total<=req.budget.amount?1:0):1;
  const flexible=avg(c.items.map(i=>i.cancellation.refundable?1:0)); const reliability=avg(c.items.map(i=>registry.get(i.supplierKey)?.reliability??0)); const feasibility=errors===0?1:0;
  const metrics=packageOptimizationMetrics({id:c.id,items:c.items,total:c.total,marginAmount:c.marginAmount},req,registry,profile);
  const factors:ScoreFactor[]=[{factor:"Itinerary feasibility",weight:weights.feasibility,value:feasibility},{factor:"Quality / luxury fit",weight:weights.luxury,value:luxuryFit},{factor:"Price",weight:weights.price,value:price},{factor:"Within budget",weight:weights.budget,value:budget},{factor:"Cancellation flexibility",weight:weights.flexibility,value:flexible},{factor:"Supplier reliability",weight:weights.reliability,value:reliability},{factor:"Geographic fit",weight:weights.geography,value:metrics.geography},{factor:"Time / convenience",weight:weights.time,value:metrics.time},{factor:"Commercial margin",weight:weights.margin,value:metrics.margin},{factor:"Customer preference fit",weight:weights.preference,value:metrics.preference}];
  const score=Math.round(factors.reduce((s,f)=>s+f.weight*f.value,0)*1000)/10; const bookable=issues.every(i=>i.severity!=="error"&&i.code!=="supplier-not-bookable"&&i.code!=="not-revalidated"); return {id:c.id,items:c.items,score,factors,issues,bookable,optimizationMetrics:metrics,paretoOptimal:paretoIds.has(c.id)};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;