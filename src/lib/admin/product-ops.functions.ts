// Staff-only operational read models for product areas that have no dedicated
// supplier console. Everything here is READ-ONLY: it summarises data that the
// existing routes/integrations already store and never calls a supplier's
// booking endpoints.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  userId: string;
  supabase: {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
};

async function assertStaff(context: Ctx) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

export const PRODUCT_AREAS = [
  "aviation",
  "cruisea",
  "trip-services",
  "rail",
  "villas",
  "yachts",
  "safari",
] as const;
export type ProductArea = (typeof PRODUCT_AREAS)[number];

const AREA: Record<
  ProductArea,
  { collections: string[]; quoteKinds: string[]; bookingTypes: string[]; providers: string[] }
> = {
  aviation: { collections: ["aviation"], quoteKinds: ["aviation", "private-aviation", "empty-legs"], bookingTypes: ["aviation", "private-aviation", "empty-leg"], providers: [] },
  cruisea: { collections: ["cruises", "cruises-expedition", "cruises-river", "cruises-world"], quoteKinds: ["cruises", "cruises-expedition", "cruises-river", "cruises-world", "cruise"], bookingTypes: ["cruise"], providers: ["cruisea"] },
  "trip-services": { collections: ["transfers", "insurance"], quoteKinds: ["transfers", "insurance"], bookingTypes: ["cab", "cabs", "insurance", "tripsafe", "transfer"], providers: ["tripjack-cabs", "tripjack-tripsafe"] },
  rail: { collections: ["rail"], quoteKinds: ["rail"], bookingTypes: ["rail"], providers: [] },
  villas: { collections: ["villas"], quoteKinds: ["villas"], bookingTypes: ["villa", "villas"], providers: [] },
  yachts: { collections: ["yachts"], quoteKinds: ["yachts"], bookingTypes: ["yacht", "yachts"], providers: [] },
  safari: { collections: ["safari"], quoteKinds: ["safari"], bookingTypes: ["safari"], providers: [] },
};

type Section = { title: string; count: number | null; note?: string; rows: Record<string, unknown>[] };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const getProductOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ area: z.enum(PRODUCT_AREAS) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertStaff(ctx);
    const cfg = AREA[data.area];
    const { collectionItems } = await import("@/lib/collections");
    const catalogue = cfg.collections.map((k) => ({
      collection: k,
      items: (collectionItems as Record<string, unknown[]>)[k]?.length ?? 0,
    }));

    // Staff verified above; quote requests have no staff SELECT policy, so read
    // them with the server client (read-only, counts + latest rows).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sections: Section[] = [];

    const quotes = await safe(async () => {
      const { data: rows, count } = await supabaseAdmin
        .from("quote_requests")
        .select("id, created_at, product_kind, product_title, status, party_size, travel_month", { count: "exact" })
        .in("product_kind", cfg.quoteKinds)
        .order("created_at", { ascending: false })
        .limit(10);
      return { title: "Quote requests", count: count ?? 0, rows: rows ?? [] } as Section;
    }, { title: "Quote requests", count: null, note: "Unavailable", rows: [] });
    sections.push(quotes);

    sections.push(
      await safe(async () => {
        const { data: rows, count } = await ctx.supabase
          .from("bookings")
          .select("reference, created_at, product_type, supplier, status, supplier_status, amount, currency", { count: "exact" })
          .in("product_type", cfg.bookingTypes)
          .order("created_at", { ascending: false })
          .limit(10);
        return { title: "Bookings", count: count ?? 0, rows: rows ?? [] } as Section;
      }, { title: "Bookings", count: null, note: "Unavailable", rows: [] }),
    );

    if (data.area === "aviation") {
      sections.push(
        await safe(async () => {
          const { data: rows, count, error } = await ctx.supabase
            .from("aviation_inquiries")
            .select("submitted_at, intent, leg_id, passengers, source", { count: "exact" })
            .order("submitted_at", { ascending: false })
            .limit(10);
          if (error) throw error;
          return { title: "Empty-leg & charter inquiries", count: count ?? 0, rows: rows ?? [], note: "Visible to Super Admin only." } as Section;
        }, { title: "Empty-leg & charter inquiries", count: null, note: "Super Admin only.", rows: [] }),
      );
    }

    if (data.area === "cruisea") {
      for (const [table, title, cols] of [
        ["cruisea_sailings", "Cruisea sailings", "id, created_at"],
        ["cruisea_bookings", "Cruisea bookings", "booking_reference, created_at, status, payment_status"],
      ] as const) {
        sections.push(
          await safe(async () => {
            const { data: rows, count, error } = await ctx.supabase
              .from(table)
              .select(cols, { count: "exact" })
              .order("created_at", { ascending: false })
              .limit(10);
            if (error) throw error;
            return { title, count: count ?? 0, rows: rows ?? [] } as Section;
          }, { title, count: null, note: "Unavailable", rows: [] }),
        );
      }
    }

    if (data.area === "trip-services") {
      sections.push(
        await safe(async () => {
          const { data: rows, count, error } = await ctx.supabase
            .from("tripjack_api_logs")
            .select("created_at, test_case, endpoint, http_status, duration_ms", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(10);
          if (error) throw error;
          return { title: "TripJack API calls (UAT)", count: count ?? 0, rows: rows ?? [] } as Section;
        }, { title: "TripJack API calls (UAT)", count: null, note: "Unavailable", rows: [] }),
        await safe(async () => {
          const { count, error } = await ctx.supabase
            .from("tripjack_certification_cases")
            .select("id", { count: "exact", head: true });
          if (error) throw error;
          return { title: "Certification cases saved", count: count ?? 0, rows: [] } as Section;
        }, { title: "Certification cases saved", count: null, note: "Unavailable", rows: [] }),
      );
    }

    const providers = cfg.providers.length
      ? await safe(async () => {
          const { data: rows } = await ctx.supabase
            .from("integration_providers")
            .select("provider_key, name, enabled, contract_status, last_health_status, last_health_at")
            .in("provider_key", cfg.providers);
          return (rows ?? []) as Record<string, unknown>[];
        }, [] as Record<string, unknown>[])
      : [];

    return { area: data.area, catalogue, sections, providers, generatedAt: new Date().toISOString() };
  });

/** Lightweight registry list for the admin sidebar (auto-discovery). */
export const getAdminRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertStaff(ctx);
    const { data } = await ctx.supabase
      .from("integration_providers")
      .select("provider_key, name, category, enabled")
      .order("name");
    return (data ?? []) as { provider_key: string; name: string; category: string | null; enabled: boolean | null }[];
  });

/** Viator AFFILIATE (Partner API, VIATOR_API_KEY) — separate from Merchant. */
export const getViatorAffiliateOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertStaff(ctx);
    const v = await import("@/lib/viator.server");
    const status = await safe(() => v.viatorStatus(), null);
    const [traces, bookings] = await Promise.all([
      safe(async () => {
        const { data } = await ctx.supabase
          .from("viator_diagnostic_traces")
          .select("created_at, step, http_status, ok, duration_ms, cart_ref")
          .order("created_at", { ascending: false })
          .limit(25);
        return (data ?? []) as Record<string, unknown>[];
      }, [] as Record<string, unknown>[]),
      safe(async () => {
        const { data, count } = await ctx.supabase
          .from("viator_activity_bookings")
          .select("created_at, cart_reference, booking_reference, product_code, status, payment_status, travel_date, failure_reason", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(15);
        return { rows: (data ?? []) as Record<string, unknown>[], count: count ?? 0 };
      }, { rows: [] as Record<string, unknown>[], count: 0 }),
    ]);
    const steps: Record<string, { calls: number; failures: number; last: string | null }> = {};
    for (const t of traces) {
      const s = (steps[String(t["step"])] ??= { calls: 0, failures: 0, last: null });
      s.calls += 1;
      if (t["ok"] === false) s.failures += 1;
      s.last ??= String(t["created_at"]);
    }
    return {
      configured: v.viatorConfigured(),
      environment: v.viatorEnvironment(),
      secret: "VIATOR_API_KEY",
      status,
      steps,
      traces,
      bookings,
    };
  });

/** Read-only probe: destination/search + optional availability schedule. */
export const probeViatorAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        destination: z.string().min(2).max(80).default("Paris"),
        productCode: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertStaff(ctx);
    const v = await import("@/lib/viator.server");
    if (!v.viatorConfigured()) return { ok: false, detail: "VIATOR_API_KEY not configured." };
    const t0 = Date.now();
    const search = await safe(async () => {
      const r = await v.searchViator({ query: data.destination } as never);
      const items = (r as unknown as { products?: { code?: string; title?: string }[] }).products ?? [];
      return { ok: true, count: items.length, sample: items.slice(0, 5).map((p) => ({ code: p.code, title: p.title })) };
    }, { ok: false, count: 0, sample: [] as { code?: string; title?: string }[] });
    const code = data.productCode ?? search.sample[0]?.code;
    const availability = code
      ? await safe(async () => {
          const s = await v.viatorSchedule(code);
          return { ok: Boolean(s), productCode: code, summary: s ? "Schedule returned" : "No schedule" };
        }, { ok: false, productCode: code, summary: "Schedule request failed" })
      : null;
    return { ok: search.ok, durationMs: Date.now() - t0, search, availability };
  });
