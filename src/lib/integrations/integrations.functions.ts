import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IntegrationProviderInput } from "./types";

async function assertStaff(context: {
  userId: string;
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
}) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

function actor(context: { userId: string; claims: Record<string, unknown> }) {
  return {
    id: context.userId,
    email: typeof context.claims["email"] === "string" ? context.claims["email"] : null,
  };
}

const keySchema = z.string().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/);

export const getIntegrationCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ providerKey: keySchema.optional(), productLimit: z.number().int().min(1).max(200).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const engine = await import("./engine.server");
    const [providers, settings, products, runs, logs, audit] = await Promise.all([
      engine.listProviders(),
      engine.getSettings(),
      engine.listProducts({
        ...(data.providerKey ? { providerKey: data.providerKey } : {}),
        limit: data.productLimit ?? 50,
      }),
      engine.listRuns({ ...(data.providerKey ? { providerKey: data.providerKey } : {}), limit: 40 }),
      engine.listLogs({ ...(data.providerKey ? { providerKey: data.providerKey } : {}), limit: 60 }),
      engine.listAudit(40),
    ]);
    return { providers, settings, products, runs, logs, audit, adapters: engine.availableAdapters() };
  });

export const testIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ providerKey: keySchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { testConnection } = await import("./engine.server");
    return testConnection(data.providerKey, actor(context));
  });

export const testAllIntegrationConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { healthAll, recordAudit } = await import("./engine.server");
    const results = await healthAll();
    await recordAudit({ ...actor(context), action: "provider.health-all" });
    return results;
  });

export const runIntegrationSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        providerKey: keySchema,
        scope: z.enum(["full", "incremental", "product"]),
        externalId: z.string().min(1).max(200).optional(),
      })
      .refine((v) => v.scope !== "product" || Boolean(v.externalId), {
        message: "Product sync requires an external ID.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { syncProvider } = await import("./engine.server");
    return syncProvider({ ...data, trigger: "manual", actor: actor(context) });
  });

export const runAllIntegrationSyncs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scope: z.enum(["full", "incremental"]).default("incremental") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { syncAllProviders } = await import("./engine.server");
    return syncAllProviders({ scope: data.scope, trigger: "manual", actor: actor(context) });
  });

export const updateIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        globalEnabled: z.boolean().optional(),
        globalAutoSync: z.boolean().optional(),
        maintenancePaused: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { updateSettings } = await import("./engine.server");
    return updateSettings(data, actor(context));
  });

export const updateIntegrationProviderFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        providerKey: keySchema,
        enabled: z.boolean().optional(),
        autoSyncEnabled: z.boolean().optional(),
        autoSyncIntervalMinutes: z.number().int().min(10).max(43200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { setProviderFlags } = await import("./engine.server");
    const { providerKey, ...flags } = data;
    return setProviderFlags(providerKey, flags, actor(context));
  });

export const saveIntegrationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): IntegrationProviderInput =>
    z
      .object({
        providerKey: keySchema,
        name: z.string().min(2).max(120),
        category: z.string().min(2).max(80),
        summary: z.string().max(800).default(""),
        baseUrl: z.union([z.literal(""), z.string().url().max(500)]),
        authKind: z.enum([
          "api-key-header",
          "bearer-token",
          "basic",
          "header-pair",
          "oauth2-client-credentials",
          "signed-session",
          "none",
        ]),
        authHeader: z.string().max(100).optional(),
        tokenPath: z.string().max(300).optional(),
        secretNames: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(8),
        catalogPath: z.string().max(500).optional(),
        healthPath: z.string().max(500).optional(),
        capabilities: z.array(z.string().max(60)).max(20),
        collections: z.array(z.string().max(60)).max(20),
        rateLimitPerSecond: z.number().int().min(1).max(100),
        maxRetries: z.number().int().min(1).max(10),
        timeoutMs: z.number().int().min(1000).max(60000),
        syncStrategy: z.enum(["full", "cursor", "updated-since", "index"]),
        paginationMode: z.enum(["none", "page", "offset", "cursor"]),
        recordPath: z.string().max(200).optional(),
        fieldMap: z.record(z.string(), z.string()).default({}),
        dedupeKeys: z.array(z.string().max(80)).min(1).max(10),
        conflictPolicy: z.enum(["supplier-wins", "local-wins", "manual-review"]),
        webhookSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional().or(z.literal("")),
        docsUrl: z.union([z.literal(""), z.string().url().max(500)]).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { upsertProvider } = await import("./engine.server");
    return upsertProvider(
      {
        provider_key: data.providerKey,
        name: data.name,
        category: data.category,
        summary: data.summary,
        base_url: data.baseUrl,
        auth_kind: data.authKind,
        auth_header: data.authHeader || null,
        token_path: data.tokenPath || null,
        secret_names: data.secretNames,
        endpoints: { catalog: data.catalogPath ?? "", health: data.healthPath ?? "" },
        capabilities: data.capabilities,
        collections: data.collections,
        rate_limit_per_second: data.rateLimitPerSecond,
        max_retries: data.maxRetries,
        timeout_ms: data.timeoutMs,
        sync_strategy: data.syncStrategy,
        pagination: { mode: data.paginationMode },
        field_map: data.fieldMap,
        record_path: data.recordPath || null,
        dedupe_keys: data.dedupeKeys,
        conflict_policy: data.conflictPolicy,
        webhook_secret_name: data.webhookSecretName || null,
        docs_url: data.docsUrl || null,
        notes: data.notes || null,
        adapter: null,
        origin: "custom",
        connection_state: "unknown",
      },
      actor(context),
    );
  });

export const getIntegrationProductData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ providerKey: keySchema, externalId: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { productApiData, recordAudit } = await import("./engine.server");
    await recordAudit({
      ...actor(context),
      action: "product.api-data.view",
      providerKey: data.providerKey,
      detail: { externalId: data.externalId },
    });
    return productApiData(data.providerKey, data.externalId);
  });
/**
 * Supplier-scoped product ledger for the per-supplier admin consoles.
 * Same staff authorization and same records as the Sync Center products tab.
 */
export const getSupplierProductLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        providerKey: keySchema,
        query: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { listProducts } = await import("./engine.server");
    return listProducts({
      providerKey: data.providerKey,
      ...(data.query ? { query: data.query } : {}),
      limit: data.limit ?? 100,
    });
  });

/** Resolve a product parked in manual review: accept the supplier record or re-pull it. */
export const resolveIntegrationConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        providerKey: keySchema,
        externalId: z.string().min(1).max(200),
        resolution: z.enum(["accept-supplier", "resync"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { resolveProductConflict } = await import("./engine.server");
    return resolveProductConflict(
      data.providerKey,
      data.externalId,
      data.resolution,
      actor(context),
    );
  });
