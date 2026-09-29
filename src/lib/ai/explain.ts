// Facts for AI explanations — derived only from stored engine results. Pure.
type Issue = { message: string; severity?: string };

export function buildFacts(j: { current_version: number; currency: string; state: string }, v: any, sim: any) {
  const pricing = v?.pricing as { total: number; currency: string } | null;
  const display = {
    journeyStatus: j.state,
    version: j.current_version,
    bookable: !!v?.bookable,
    total: pricing ? `${pricing.total.toFixed(2)} ${pricing.currency}` : "price not yet confirmed",
    components: ((v?.graph ?? []) as { kind: string }[]).map((c) => c.kind),
    cautions: ((v?.issues ?? []) as Issue[]).map((i) => i.message.replace(/\b[a-z0-9-]+:(flight|stay|activity|transfer|cruise|insurance|aviation|rail):\S+/gi, "a component")).slice(0, 8),
    proposedChange: sim ? {
      status: sim.status,
      needsApproval: sim.requires_approval,
      bookableAfter: sim.bookable_after,
      priceChange: sim.price_delta == null ? "not confirmed" : `${Number(sim.price_delta).toFixed(2)} ${j.currency}`,
      laterPartsAffected: (sim.impacted ?? []).length,
      differences: sim.material ?? [],
    } : null,
  };
  const allowed = JSON.stringify(display).match(/\d+(?:[.,:]\d+)*/g) ?? [];
  return { display, allowed };
}

export function deterministicExplanation(f: ReturnType<typeof buildFacts>): string {
  const d = f.display;
  const parts = [`Your journey (version ${d.version}) is ${d.bookable ? "ready to book" : "not yet bookable"}; total ${d.total}.`];
  if (d.cautions.length) parts.push(`Points to review: ${d.cautions.join("; ")}.`);
  if (d.proposedChange) parts.push(`The proposed change ${d.proposedChange.needsApproval ? "needs your approval" : "is minor"}; price change ${d.proposedChange.priceChange}; ${d.proposedChange.laterPartsAffected} later part(s) affected.`);
  return parts.join(" ");
}
