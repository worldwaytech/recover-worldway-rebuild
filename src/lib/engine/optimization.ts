import type { ComponentKind, NormalizedComponent, SupplierRegistration, TripRequirements } from "./types";

export interface RankingWeights { feasibility:number; luxury:number; price:number; budget:number; flexibility:number; reliability:number; geography:number; time:number; margin:number; preference:number; }
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = { feasibility:0.22, luxury:0.14, price:0.12, budget:0.08, flexibility:0.08, reliability:0.10, geography:0.08, time:0.07, margin:0.06, preference:0.05 };
export interface RankingProfile { weights?: Partial<RankingWeights>; kindPreferences?: Partial<Record<ComponentKind, number>>; interests?: string[]; }
export interface PackageOptimizationInput { id:string; items:NormalizedComponent[]; total:number; marginAmount?:number; }
export interface PackageOptimizationMetrics { geography:number; time:number; margin:number; preference:number; }
export function resolveRankingWeights(profile?: RankingProfile): RankingWeights { const merged={...DEFAULT_RANKING_WEIGHTS,...(profile?.weights??{})}; const safe=(value:number)=>Number.isFinite(value)?Math.max(0,value):0; const total=Object.values(merged).reduce((s,v)=>s+safe(v),0)||1; const normalized=Object.fromEntries(Object.entries(merged).map(([k,v])=>[k,safe(v)/total])) as Record<string,number>; return {feasibility:normalized.feasibility,luxury:normalized.luxury,price:normalized.price,budget:normalized.budget,flexibility:normalized.flexibility,reliability:normalized.reliability,geography:normalized.geography,time:normalized.time,margin:normalized.margin,preference:normalized.preference}; }
export function componentPreference(c:NormalizedComponent, profile:RankingProfile={}):number { const kind=profile.kindPreferences?.[c.kind]??0.5; const terms=(profile.interests??[]).map(x=>x.trim().toLowerCase()).filter(Boolean); const title=c.title.toLowerCase(); const interestFit=terms.length?terms.filter(x=>title.includes(x)).length/terms.length:0.5; return Math.max(0,Math.min(1,(kind+interestFit)/2)); }
export function packageOptimizationMetrics(input:PackageOptimizationInput, req:TripRequirements, registry:Map<string,SupplierRegistration>, profile:RankingProfile={}):PackageOptimizationMetrics {
 const places=new Set(req.destinations.map(x=>x.toLowerCase())); const covered=new Set<string>(); for(const c of input.items){if(places.has(c.start.place.toLowerCase()))covered.add(c.start.place.toLowerCase());if(places.has(c.end.place.toLowerCase()))covered.add(c.end.place.toLowerCase());}
 const geography=places.size?covered.size/places.size:1; const sorted=[...input.items].sort((a,b)=>Date.parse(a.start.at)-Date.parse(b.start.at)); const gaps:number[]=[]; for(let i=1;i<sorted.length;i++){const gap=(Date.parse(sorted[i]!.start.at)-Date.parse(sorted[i-1]!.end.at))/3600000;if(gap>=0)gaps.push(gap);} const time=gaps.length?gaps.reduce((s,g)=>s+Math.max(0,Math.min(1,1-Math.abs(g-2)/24)),0)/gaps.length:1;
 const net=input.items.reduce((s,c)=>s+c.net.amount,0); const marginAmount=input.marginAmount??Math.max(0,input.total-net); const margin=input.total>0?Math.max(0,Math.min(1,marginAmount/input.total)):0; const preference=input.items.length?input.items.reduce((s,c)=>s+componentPreference(c,profile),0)/input.items.length:0; void registry; return {geography,time,margin,preference};
}
export function rankComponents(components:NormalizedComponent[], req:TripRequirements, registry:Map<string,SupplierRegistration>, profile:RankingProfile={}):NormalizedComponent[] {
 const places=new Set(req.destinations.map(x=>x.toLowerCase()));
 const configured=profile.weights && ["luxury","reliability","geography","preference"].some((key)=>profile.weights?.[key as keyof RankingWeights] !== undefined);
 const componentWeights=configured ? (()=>{const raw={luxury:Math.max(0,profile.weights?.luxury??0),reliability:Math.max(0,profile.weights?.reliability??0),geography:Math.max(0,profile.weights?.geography??0),preference:Math.max(0,profile.weights?.preference??0)};const total=Object.values(raw).reduce((s,v)=>s+v,0)||1;return {luxury:raw.luxury/total,reliability:raw.reliability/total,geography:raw.geography/total,preference:raw.preference/total};})():{luxury:.30,reliability:.20,geography:.20,preference:.30};
 const score=(c:NormalizedComponent)=>{
  const quality=(c.quality??3)/5;
  const luxury=1-Math.abs(quality*5-req.luxuryLevel)/5;
  const geography=places.size?Number(places.has(c.start.place.toLowerCase())||places.has(c.end.place.toLowerCase())):1;
  const reliability=registry.get(c.supplierKey)?.reliability??0;
  const preference=componentPreference(c,profile);
  return componentWeights.luxury*luxury+componentWeights.reliability*reliability+componentWeights.geography*geography+componentWeights.preference*preference;
 };
 return [...components].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
}
export interface OptimizationObjective { key: "score" | "price" | "margin" | "geography" | "time" | "preference"; direction: "maximize" | "minimize"; }

/** Deterministic Pareto frontier. A candidate is dominated only when another candidate
 * is at least as good on every objective and strictly better on one. */
export function paretoFrontier(candidates: PackageOptimizationInput[], req: TripRequirements, registry: Map<string, SupplierRegistration>, profile: RankingProfile = {}): PackageOptimizationInput[] {
  const objectives: OptimizationObjective[] = [
    { key: "margin", direction: "maximize" }, { key: "geography", direction: "maximize" },
    { key: "time", direction: "maximize" }, { key: "preference", direction: "maximize" },
    { key: "price", direction: "minimize" },
  ];
  const scored = candidates.map((candidate) => ({ candidate, metrics: packageOptimizationMetrics(candidate, req, registry, profile) }));
  const metric = (x: typeof scored[number], key: OptimizationObjective["key"]) => key === "price" ? x.candidate.total : x.metrics[key as keyof PackageOptimizationMetrics];
  const dominates = (a: typeof scored[number], b: typeof scored[number]) => {
    let strict = false;
    for (const o of objectives) {
      const av = metric(a, o.key), bv = metric(b, o.key);
      if (o.direction === "maximize" && av < bv) return false;
      if (o.direction === "minimize" && av > bv) return false;
      if (av !== bv) strict = true;
    }
    return strict;
  };
  return scored.filter((x, i) => !scored.some((y, j) => i !== j && dominates(y, x))).map((x) => x.candidate).sort((a,b) => a.id.localeCompare(b.id));
}

/** Rank Pareto candidates with the same configurable optimization profile used by package ranking. */
export function optimizationScore(candidate: PackageOptimizationInput, candidates: PackageOptimizationInput[], req: TripRequirements, registry: Map<string,SupplierRegistration>, profile: RankingProfile = {}): number {
  const weights = resolveRankingWeights(profile);
  const metrics = packageOptimizationMetrics(candidate, req, registry, profile);
  const totals = candidates.map((x) => x.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const price = max === min ? 1 : 1 - (candidate.total - min) / (max - min);
  return weights.price * price + weights.geography * metrics.geography + weights.time * metrics.time + weights.margin * metrics.margin + weights.preference * metrics.preference;
}

/** Select a stable shortlist while preserving Pareto objective diversity and ranking preferences. */
export function optimizePackageSet(candidates: PackageOptimizationInput[], req: TripRequirements, registry: Map<string,SupplierRegistration>, limit = 3, profile: RankingProfile = {}): PackageOptimizationInput[] {
  if (limit <= 0 || !candidates.length) return [];
  const frontier = paretoFrontier(candidates, req, registry, profile);
  const ranked = [...frontier].sort((a,b) => {
    const delta = optimizationScore(b, candidates, req, registry, profile) - optimizationScore(a, candidates, req, registry, profile);
    return Math.abs(delta) > 1e-12 ? delta : a.id.localeCompare(b.id);
  });
  const selected = ranked.slice(0, limit);
  if (selected.length < limit) {
    for (const candidate of candidates.slice().sort((a,b) => a.id.localeCompare(b.id))) {
      if (selected.some((x) => x.id === candidate.id)) continue;
      selected.push(candidate);
      if (selected.length === limit) break;
    }
  }
  return selected;
}
