import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCrystalConnectorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ health: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { crystalStatus } = await import("./connector.server");
    return crystalStatus(Boolean(data.health));
  });

export const runCrystalSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { crystalSync } = await import("./connector.server");
    return crystalSync(Boolean(data.force));
  });

/** Public, non-sensitive licence state used by the storefront. */
export const getCrystalInventoryState = createServerFn({ method: "GET" }).handler(async () => {
  const { licensedVoyages } = await import("./inventory");
  const { getConnector } = await import("@/lib/partners/registry");
  const cfg = getConnector("crystal-cruises");
  return {
    licensed: licensedVoyages().length > 0,
    voyageCount: licensedVoyages().length,
    contractStatus: cfg?.contractStatus ?? "prospective",
    generatedAt: new Date().toISOString(),
  };
});
