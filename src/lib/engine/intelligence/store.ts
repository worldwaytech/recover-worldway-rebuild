// Persistent journey service: state, versions, simulations, approvals, audit, rollback.
// Storage is behind JourneyRepo so the logic is testable and survives restarts
// through the database implementation (store.server.ts).
import { normalizeOffers, type CanonicalOffer } from "../normalize";
import { runPackagePipeline, type PipelineInput } from "../package";
import { buildDependencies, transition, type JourneyContext, type JourneyState } from "./journey";
import { simulate, type Change } from "./simulate";

export interface JourneyRow { id: string; user_id: string; state: JourneyState; current_version: number; currency: string; requirements: unknown }
export interface VersionRow { journey_id: string; version: number; parent_version: number | null; offers: CanonicalOffer[]; graph: unknown; dependencies: unknown; pricing: unknown; issues: unknown; bookable: boolean; reason: string; simulation_id: string | null; created_by: string | null }
export interface SimulationRow { id: string; journey_id: string; base_version: number; change: StoredChange; impacted: string[]; material: string[]; price_delta: number | null; new_issues: string[]; after_pricing: unknown; after_issues: unknown; after_offers: CanonicalOffer[]; requires_approval: boolean; bookable_after: boolean; status: "pending" | "approved" | "rejected" | "applied" | "superseded"; created_by: string | null }
export interface EventRow { journey_id: string; event_type: string; from_state?: string | null; to_state?: string | null; version?: number | null; actor?: string | null; detail?: unknown }
export type StoredChange = Change | { type: "rollback"; toVersion: number };

export interface JourneyRepo {
  insertJourney(j: Omit<JourneyRow, "id">): Promise<JourneyRow>;
  getJourney(id: string): Promise<JourneyRow | null>;
  updateJourney(id: string, patch: Partial<JourneyRow>, expectVersion: number): Promise<boolean>;
  insertVersion(v: VersionRow): Promise<void>;
  getVersion(journeyId: string, version: number): Promise<VersionRow | null>;
  insertSimulation(s: Omit<SimulationRow, "id">): Promise<SimulationRow>;
  getSimulation(id: string): Promise<SimulationRow | null>;
  setSimulationStatus(id: string, status: SimulationRow["status"]): Promise<void>;
  insertApproval(a: { journey_id: string; simulation_id: string; decision: "approved" | "rejected"; decided_by: string; note?: string | null }): Promise<void>;
  insertEvent(e: EventRow): Promise<void>;
}

type Env = Omit<PipelineInput, "candidates">;

function snapshot(offers: CanonicalOffer[], env: Env, label: string) {
  const [p] = runPackagePipeline({ ...env, candidates: [{ id: label, offers }] });
  return { p: p!, deps: buildDependencies(normalizeOffers(offers).components) };
}

export class JourneyService {
  constructor(private repo: JourneyRepo, private env: (j: JourneyRow) => Env) {}

  async create(userId: string, offers: CanonicalOffer[], currency: string, requirements: Env["requirements"]) {
    const j = await this.repo.insertJourney({ user_id: userId, state: "draft", current_version: 1, currency, requirements });
    const { p, deps } = snapshot(offers, this.env(j), `${j.id}@v1`);
    await this.repo.insertVersion({ journey_id: j.id, version: 1, parent_version: null, offers, graph: p.graph, dependencies: deps, pricing: p.pricing, issues: p.issues, bookable: p.bookable, reason: "created", simulation_id: null, created_by: userId });
    await this.repo.insertEvent({ journey_id: j.id, event_type: "created", to_state: "draft", version: 1, actor: userId });
    return j;
  }

  async context(id: string): Promise<{ row: JourneyRow; ctx: JourneyContext }> {
    const row = await this.repo.getJourney(id);
    if (!row) throw new Error("Journey not found");
    const v = await this.repo.getVersion(id, row.current_version);
    if (!v) throw new Error("Journey version missing");
    return { row, ctx: { journeyId: id, version: row.current_version, state: row.state, offers: v.offers } };
  }

  /** Persist a what-if: full reprice/revalidate/audit. Never changes the journey. */
  async simulate(id: string, change: StoredChange, actor: string) {
    const { row, ctx } = await this.context(id);
    let rec: Omit<SimulationRow, "id">;
    if (change.type === "rollback") {
      const target = await this.repo.getVersion(id, change.toVersion);
      if (!target || change.toVersion >= row.current_version) throw new Error("Invalid rollback target");
      const before = snapshot(ctx.offers, this.env(row), "before").p;
      const { p } = snapshot(target.offers, this.env(row), "rollback");
      const priceDelta = before.pricing && p.pricing ? Math.round((p.pricing.total - before.pricing.total) * 100) / 100 : null;
      rec = { journey_id: id, base_version: row.current_version, change, impacted: [], material: ["rollback"], price_delta: priceDelta, new_issues: p.issues.map((i) => i.message), after_pricing: p.pricing, after_issues: p.issues, after_offers: target.offers, requires_approval: true, bookable_after: p.bookable, status: "pending", created_by: actor };
    } else {
      const s = simulate(ctx, change, this.env(row));
      const offers = normalizeOffersApply(ctx.offers, change);
      rec = { journey_id: id, base_version: row.current_version, change, impacted: s.impacted, material: s.material, price_delta: s.priceDelta, new_issues: s.newIssues, after_pricing: s.after.pricing, after_issues: s.after.issues, after_offers: offers, requires_approval: s.requiresApproval, bookable_after: s.bookableAfter, status: "pending", created_by: actor };
    }
    const saved = await this.repo.insertSimulation(rec);
    await this.repo.insertEvent({ journey_id: id, event_type: "simulated", version: row.current_version, actor, detail: { simulation_id: saved.id, change: change.type, requires_approval: rec.requires_approval } });
    return saved;
  }

  /** Human decision. Approved changes are re-validated against the CURRENT version before applying. */
  async decide(simulationId: string, decision: "approved" | "rejected", actor: string, note?: string) {
    const sim = await this.repo.getSimulation(simulationId);
    if (!sim || sim.status !== "pending") throw new Error("Simulation is not pending");
    const { row } = await this.context(sim.journey_id);
    await this.repo.insertApproval({ journey_id: sim.journey_id, simulation_id: sim.id, decision, decided_by: actor, note: note ?? null });
    if (decision === "rejected") {
      await this.repo.setSimulationStatus(sim.id, "rejected");
      await this.repo.insertEvent({ journey_id: sim.journey_id, event_type: "change_rejected", version: row.current_version, actor, detail: { simulation_id: sim.id } });
      return { applied: false as const };
    }
    if (sim.base_version !== row.current_version) {
      await this.repo.setSimulationStatus(sim.id, "superseded");
      throw new Error("Journey changed since simulation; re-simulate");
    }
    // Re-audit at apply time — never trust a stale result.
    const { p, deps } = snapshot(sim.after_offers, this.env(row), "apply");
    if (p.issues.some((i) => i.severity === "error" && i.code !== "substitution-requires-approval")) throw new Error("Change fails audit; cannot update journey");
    const next = row.current_version + 1;
    const toState: JourneyState = row.state === "booked" || row.state === "disrupted" ? "proposed" : row.state;
    if (toState !== row.state) transition(row.state, toState);
    await this.repo.insertVersion({ journey_id: row.id, version: next, parent_version: row.current_version, offers: sim.after_offers, graph: p.graph, dependencies: deps, pricing: p.pricing, issues: p.issues, bookable: p.bookable, reason: sim.change.type === "rollback" ? `rollback to v${sim.change.toVersion}` : `change: ${sim.change.type}`, simulation_id: sim.id, created_by: actor });
    const ok = await this.repo.updateJourney(row.id, { current_version: next, state: toState }, row.current_version);
    if (!ok) throw new Error("Concurrent update; re-simulate");
    await this.repo.setSimulationStatus(sim.id, "applied");
    await this.repo.insertEvent({ journey_id: row.id, event_type: "change_applied", from_state: row.state, to_state: toState, version: next, actor, detail: { simulation_id: sim.id, impacted: sim.impacted, material: sim.material } });
    return { applied: true as const, version: next, bookable: p.bookable };
  }

  async setState(id: string, to: JourneyState, actor: string, detail?: unknown) {
    const { row } = await this.context(id);
    transition(row.state, to);
    if (to === "booked") throw new Error("Booked state is set only by the booking engine");
    const ok = await this.repo.updateJourney(id, { state: to }, row.current_version);
    if (!ok) throw new Error("Concurrent update");
    await this.repo.insertEvent({ journey_id: id, event_type: "state_changed", from_state: row.state, to_state: to, version: row.current_version, actor, detail });
  }
}

function normalizeOffersApply(offers: CanonicalOffer[], c: Change): CanonicalOffer[] {
  if (c.type === "add") return [...offers, c.offer];
  if (c.type === "remove") return offers.filter((o) => o.externalId !== c.externalId);
  return offers.map((o) => (o.externalId === c.externalId ? c.with : o));
}
