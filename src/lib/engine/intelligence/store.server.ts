// Database-backed JourneyRepo (service role; callers verify access first).
import type { JourneyRepo, JourneyRow, SimulationRow } from "./store";

type Db = { from: (t: string) => any };

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}
const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(`Journey store: ${r.error.message}`);
  return r.data;
};

export const supabaseJourneyRepo: JourneyRepo = {
  async insertJourney(j) { return must(await (await db()).from("journeys").insert(j).select().single()) as JourneyRow; },
  async getJourney(id) { return must(await (await db()).from("journeys").select().eq("id", id).maybeSingle()) as JourneyRow | null; },
  async updateJourney(id, patch, expectVersion) {
    const rows = must(await (await db()).from("journeys").update(patch).eq("id", id).eq("current_version", expectVersion).select("id")) as unknown[];
    return rows.length === 1;
  },
  async insertVersion(v) { must(await (await db()).from("journey_versions").insert(v)); },
  async getVersion(journeyId, version) { return must(await (await db()).from("journey_versions").select().eq("journey_id", journeyId).eq("version", version).maybeSingle()); },
  async insertSimulation(s) { return must(await (await db()).from("journey_simulations").insert(s).select().single()) as SimulationRow; },
  async getSimulation(id) { return must(await (await db()).from("journey_simulations").select().eq("id", id).maybeSingle()); },
  async setSimulationStatus(id, status) { must(await (await db()).from("journey_simulations").update({ status }).eq("id", id)); },
  async insertApproval(a) { must(await (await db()).from("journey_approvals").insert(a)); },
  async insertEvent(e) { must(await (await db()).from("journey_events").insert({ detail: {}, ...e })); },
};
