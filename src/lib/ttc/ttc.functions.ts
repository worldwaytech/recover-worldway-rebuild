import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TtcBrand } from "./config";
import type { TtcCatalogueFilters } from "./types";

export const searchTtcTours = createServerFn({ method: "GET" })
  .inputValidator((input: TtcCatalogueFilters | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { searchTtcCatalogue } = await import("./catalogue.server");
    return searchTtcCatalogue(data);
  });

export const getTtcTourDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { brand: string; slug: string }) => input)
  .handler(async ({ data }) => {
    const { getTtcTour } = await import("./catalogue.server");
    return getTtcTour(data.brand, data.slug);
  });

export const getTtcCatalogueFacets = createServerFn({ method: "GET" }).handler(async () => {
  const { getTtcFacets } = await import("./catalogue.server");
  return getTtcFacets();
});

async function assertStaff(context: { supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean; error: unknown }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error("Your permissions could not be verified.");
  if (!data) throw new Error("Forbidden");
}

export const getTtcAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { probe?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const [{ ttcApiStatus, probeTtcApi, ttcRateLimit }, { ttcCatalogueStats }, { firecrawlConfigured }] =
      await Promise.all([
        import("./api.server"),
        import("./ingest.server"),
        import("./firecrawl.server"),
      ]);
    const stats = await ttcCatalogueStats();
    return {
      api: ttcApiStatus(),
      rateLimit: ttcRateLimit(),
      contentSource: { firecrawlConnected: firecrawlConfigured() },
      probe: data.probe ? await probeTtcApi() : null,
      ...stats,
    };
  });

export const runTtcContentSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { brand: string; limit?: number; refresh?: boolean; cursor?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const [{ importTtcBrand }, { isTtcBrand }] = await Promise.all([
      import("./ingest.server"),
      import("./config"),
    ]);
    if (!isTtcBrand(data.brand)) throw new Error("Unknown TTC brand.");
    return importTtcBrand({
      brand: data.brand as TtcBrand,
      limit: Math.min(Math.max(data.limit ?? 50, 1), 200),
      ...(data.refresh !== undefined ? { refresh: data.refresh } : {}),
      ...(data.cursor !== undefined ? { cursor: data.cursor } : {}),
    });
  });

export const probeTtcApiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { probeTtcApi } = await import("./api.server");
    return probeTtcApi();
  });
