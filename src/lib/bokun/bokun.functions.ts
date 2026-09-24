// Bókun + OCTO server functions. Public read-only search/detail/availability;
// staff-gated verification and sync; booking writes hard-gated server-side.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: {
  userId: string;
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
}) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const searchMarketplaceTours = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().max(120).optional(),
        page: z.number().int().min(1).max(50).optional(),
        startDate: dateSchema.optional(),
        endDate: dateSchema.optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { searchTours } = await import("./catalogue.server");
    try {
      return await searchTours(data);
    } catch (err) {
      return { items: [], total: 0, page: data.page ?? 1, pageSize: 24, error: err instanceof Error ? err.message : "Search unavailable" };
    }
  });

export const getMarketplaceProduct = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().regex(/^\d{1,12}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { getProduct } = await import("./catalogue.server");
    return getProduct(data.id);
  });

export const getMarketplaceAvailability = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().regex(/^\d{1,12}$/), start: dateSchema, end: dateSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getAvailability } = await import("./catalogue.server");
    return getAvailability(data.id, data.start, data.end);
  });

// ------------------------------------------------------------- staff/admin

export const verifyBokunEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { verifyEnvironment } = await import("./catalogue.server");
    return verifyEnvironment();
  });

export const syncBokunCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { syncCatalogue } = await import("./catalogue.server");
    return syncCatalogue();
  });

/** Read-only smoke test: search + product detail + availability. No bookings. */
export const runBokunSmokeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const catalogue = await import("./catalogue.server");
    const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
    const search = await catalogue.searchTours({ page: 1, pageSize: 3 }).catch((e: Error) => {
      steps.push({ step: "search", ok: false, detail: e.message });
      return null;
    });
    if (search) {
      steps.push({ step: "search", ok: true, detail: `${search.total} products visible, ${search.items.length} returned` });
      const first = search.items[0];
      if (first) {
        const detail = await catalogue.getProduct(first.id).then(() => true).catch(() => false);
        steps.push({ step: "product-detail", ok: detail, detail: detail ? `product ${first.id} loaded` : "failed" });
        const today = new Date();
        const end = new Date(today.getTime() + 30 * 86400000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const slots = await catalogue.getAvailability(first.id, fmt(today), fmt(end)).catch(() => null);
        steps.push({
          step: "availability",
          ok: slots !== null,
          detail: slots ? `${slots.length} availability days in next 30` : "failed",
        });
      }
    }
    const { bookingsEnabled } = await import("./booking.server");
    steps.push({
      step: "booking-gate",
      ok: true,
      detail: bookingsEnabled() ? "bookings ENABLED (operator-confirmed)" : "bookings DISABLED (pending environment confirmation)",
    });
    return { steps, environment: process.env["BOKUN_ENVIRONMENT"] ?? "test (default until verified)" };
  });

// ------------------------------------------------ marketplace sync (staff)

export const runBokunMarketplaceSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scope: z.enum(["full", "incremental"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { runMarketplaceSync } = await import("./sync.server");
    return runMarketplaceSync({ scope: data.scope, trigger: "manual" });
  });

export const getBokunMarketplaceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { marketplaceOverview } = await import("./sync.server");
    const { bookingsEnabled } = await import("./booking.server");
    return { ...(await marketplaceOverview()), bookingsEnabled: bookingsEnabled() };
  });
