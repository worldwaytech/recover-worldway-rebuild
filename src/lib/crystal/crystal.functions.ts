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

/**
 * Public storefront feed — live Crystal voyages from the authorised AKTG
 * Shopping API. The subscription key stays server-side; only normalised,
 * customer-facing voyage records cross the boundary.
 */
export const getCrystalVoyages = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ currency: z.string().length(3).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { fetchAktgVoyages } = await import("./aktg.server");
    const { crystalWorldCruises } = await import("./world-cruises");
    const feed = await fetchAktgVoyages(data.currency ?? "USD");
    // The AKTG entitlement carries segment voyages only; Crystal's published
    // World Cruises are merged in from the official catalogue (enquiry only).
    const codes = new Set(feed.voyages.map((v) => v.code));
    const worldCruises = crystalWorldCruises().filter((v) => !codes.has(v.code));
    const { summariseCrystalInventory } = await import("./inventory-status");
    const { bookingCapability } = await import("./aktg-booking.server");
    const inventory = summariseCrystalInventory([...feed.voyages, ...worldCruises]);
    return {
      inventory,
      liveBookingOpen: bookingCapability().live,
      voyages: [...feed.voyages, ...worldCruises].sort((a, b) =>
        a.departureDate.localeCompare(b.departureDate),
      ),
      licensed: feed.voyages.length > 0,
      currency: feed.currency,
      syncedAt: feed.fetchedAt,
      supplierRecords: feed.received,
      worldCruiseRecords: worldCruises.length,
      configured: feed.configured,
    };
  });

/** Public, non-sensitive licence state used by the storefront. */
export const getCrystalInventoryState = createServerFn({ method: "GET" }).handler(async () => {
  const { licensedVoyages } = await import("./inventory");
  const { getConnector } = await import("@/lib/partners/registry");
  const cfg = getConnector("crystal-cruises");
  const { fetchAktgVoyages } = await import("./aktg.server");
  const feed = await fetchAktgVoyages("USD");
  return {
    licensed: feed.voyages.length > 0 || licensedVoyages().length > 0,
    voyageCount: feed.voyages.length || licensedVoyages().length,
    contractStatus: cfg?.contractStatus ?? "prospective",
    generatedAt: new Date().toISOString(),
  };
});

/**
 * Live price and availability revalidation for a single voyage, straight from
 * the AKTG availability operation. Called before a quote or checkout so the
 * customer never transacts on a cached fare.
 */
export const revalidateCrystalVoyage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        voyageNumber: z.string().min(3).max(40),
        currency: z.string().length(3).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { revalidateAktgVoyage } = await import("./aktg.server");
    return revalidateAktgVoyage(data.voyageNumber, data.currency ?? "USD");
  });

/**
 * Supplier reference catalogues (destinations, ports, ships and suite
 * categories, fare types, promotions) used by search facets and the
 * admin connector panel.
 */
export const getCrystalReferenceData = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAktgReferenceData } = await import("./aktg.server");
  return fetchAktgReferenceData();
});
