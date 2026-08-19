// HBX server functions. Thin wrappers only — every runtime import happens
// inside a handler so the server-only supplier code never enters the client
// bundle, and supplier credentials never leave the server.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const suiteSchema = z.enum(["hotels", "activities", "transfers"]);

const catalogueSchema = z.object({
  suite: suiteSchema,
  q: z.string().max(120).optional(),
  countryCode: z.string().max(3).optional(),
  destinationCode: z.string().max(10).optional(),
  minStars: z.number().min(0).max(5).optional(),
  category: z.string().max(30).optional(),
  page: z.number().int().min(1).max(500).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
});

/** Public, read-only catalogue search over synchronised HBX content. */
export const searchHbxCatalogue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => catalogueSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { queryHbxCatalogue } = await import("./catalogue.server");
    try {
      return await queryHbxCatalogue(data);
    } catch {
      return {
        suite: data.suite,
        items: [],
        total: 0,
        page: data.page ?? 1,
        pageSize: data.pageSize ?? 24,
        pageCount: 1,
        environment: "unknown",
        empty: true,
        message: "The HBX catalogue is temporarily unavailable. Please try again shortly.",
      };
    }
  });

/** Public detail read for a synchronised HBX hotel. */
export const getHbxHotelDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { getHbxHotel } = await import("./catalogue.server");
    try {
      return { hotel: await getHbxHotel(data.code) };
    } catch {
      return { hotel: null };
    }
  });

/** Non-sensitive public status so the storefront can badge suite readiness. */
export const getHbxPublicStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { HBX_SECTIONS, HBX_SUITE_CONFIG, HBX_SUPPLIER_NAME } = await import("./config");
  const { hbxCredentialStatus, hbxEnvironment, hbxSuiteEnabled } = await import("./client.server");
  return {
    supplier: HBX_SUPPLIER_NAME,
    environment: hbxEnvironment(),
    sections: HBX_SECTIONS.map((s) => ({
      ...s,
      summary: HBX_SUITE_CONFIG[s.id].summary,
      enabled: hbxSuiteEnabled(s.id),
      ready: hbxSuiteEnabled(s.id) && hbxCredentialStatus(s.id).configured,
    })),
  };
});

// ------------------------------------------------------------ admin surface

async function assertAdmin(context: unknown) {
  const { isAdmin } = await import("@/lib/wwl.server");
  if (!(await isAdmin(context as never))) throw new Error("Forbidden");
}

/** Admin console payload: credentials, health, sync state, cache and logs. */
export const getHbxAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ probe: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { HBX_SUITES, HBX_SUITE_CONFIG, HBX_SECRET_NAMES, HBX_MASTER_FEATURE_FLAG } =
      await import("./config");
    const {
      hbxCacheStats,
      hbxCredentialStatus,
      hbxEnvironment,
      hbxLog,
      hbxSuiteEnabled,
      hbxSuiteHealth,
    } = await import("./client.server");
    const { hbxSyncSummary } = await import("./ingest.server");

    const health = data.probe
      ? await Promise.all(HBX_SUITES.map((s) => hbxSuiteHealth(s)))
      : HBX_SUITES.map((suite) => {
          const { configured, missing } = hbxCredentialStatus(suite);
          return {
            suite,
            label: HBX_SUITE_CONFIG[suite].label,
            environment: hbxEnvironment(),
            enabled: hbxSuiteEnabled(suite),
            configured,
            missingSecrets: missing,
            reachable: null,
            status: null,
            latencyMs: null,
            message: configured ? "Credentials present." : `Awaiting credentials: ${missing.join(", ")}.`,
            checkedAt: new Date().toISOString(),
          };
        });

    let sync: Awaited<ReturnType<typeof hbxSyncSummary>> = [];
    let syncError: string | null = null;
    try {
      sync = await hbxSyncSummary();
    } catch (e) {
      syncError = e instanceof Error ? e.message : "Sync history unavailable.";
    }

    return {
      environment: hbxEnvironment(),
      masterFlag: HBX_MASTER_FEATURE_FLAG,
      requiredSecrets: HBX_SECRET_NAMES,
      suites: HBX_SUITES.map((suite) => ({
        suite,
        label: HBX_SUITE_CONFIG[suite].label,
        summary: HBX_SUITE_CONFIG[suite].summary,
        featureFlag: HBX_SUITE_CONFIG[suite].featureFlag,
        secrets: [
          HBX_SUITE_CONFIG[suite].apiKeySecret,
          HBX_SUITE_CONFIG[suite].apiSecretSecret,
        ],
        rateLimitPerSecond: HBX_SUITE_CONFIG[suite].rateLimitPerSecond,
        cacheTtlSeconds: HBX_SUITE_CONFIG[suite].cacheTtlSeconds,
      })),
      health,
      sync,
      syncError,
      cache: hbxCacheStats(),
      log: hbxLog(40),
    };
  });

/** Admin-triggered content synchronisation for one suite. */
export const runHbxSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        suite: suiteSchema,
        maxPages: z.number().int().min(1).max(200).optional(),
        since: z.string().max(30).optional(),
        countryCode: z.string().max(3).optional(),
        destinationCode: z.string().max(10).optional(),
        countryCodes: z.array(z.string().max(3)).max(25).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { syncHbxActivities, syncHbxHotels, syncHbxTransfers } = await import("./ingest.server");
    if (data.suite === "hotels")
      return syncHbxHotels({
        maxPages: data.maxPages,
        since: data.since,
        countryCode: data.countryCode,
        destinationCode: data.destinationCode,
      });
    if (data.suite === "activities")
      return syncHbxActivities({
        maxPages: data.maxPages,
        country: data.countryCode,
        destination: data.destinationCode,
      });
    return syncHbxTransfers({ countryCodes: data.countryCodes });
  });

/** Admin cache invalidation (per suite, or everything). */
export const invalidateHbxCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ suite: suiteSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { hbxCacheInvalidate } = await import("./client.server");
    return { cleared: hbxCacheInvalidate(data.suite ? `${data.suite}:` : undefined) };
  });

/** Admin readiness probe for the booking-side APIs (creates nothing). */
export const probeHbxBookingReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ suite: suiteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.suite === "hotels") {
      const { probeHotelBookingApi } = await import("./hotels.server");
      const res = await probeHotelBookingApi();
      return { suite: data.suite, ok: res.ok, status: res.status, message: res.error?.message ?? "Reachable." };
    }
    if (data.suite === "activities") {
      const { fetchActivityReference } = await import("./activities.server");
      const res = await fetchActivityReference("currencies");
      return { suite: data.suite, ok: res.ok, status: res.status, message: res.error?.message ?? "Reachable." };
    }
    const { fetchTransferReference } = await import("./transfers.server");
    const res = await fetchTransferReference("vehicles");
    return { suite: data.suite, ok: res.ok, status: res.status, message: res.error?.message ?? "Reachable." };
  });
