import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPartnerHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { healthAll, partnerLogs } = await import("./runtime.server");
    return { health: await healthAll(), logs: partnerLogs(40) };
  });

export const runPartnerSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ partnerId: z.string().max(60).optional(), force: z.boolean().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { syncCatalogue, syncAll, invalidatePartnerCache } = await import("./runtime.server");
    if (data.force) invalidatePartnerCache(data.partnerId);
    const results = data.partnerId
      ? [await syncCatalogue(data.partnerId, { force: data.force })]
      : await syncAll();
    return {
      results: results.map((r) => ({
        partnerId: r.partnerId,
        partnerName: r.partnerName,
        mode: r.mode,
        received: r.received,
        created: r.created,
        updated: r.updated,
        fromCache: r.fromCache,
        durationMs: r.durationMs,
        warnings: r.warnings,
        syncedAt: r.syncedAt,
      })),
    };
  });
