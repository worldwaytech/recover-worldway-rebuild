import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthCtx, PartnerResult, PartnerLookupResult, PartnerLookupRow } from "./wwl.server";

// Re-exports so existing imports (`@/lib/wwl.functions`) keep working.
export { toPartnerHotelPayload } from "./wwl-adapters";
export type { PartnerResult, PartnerLookupResult, PartnerLookupRow };

// -------- Manifest discovery --------
export const refreshPartnerManifest = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchManifest } = await import("./wwl.server");
  const m = await fetchManifest();
  return {
    ok: !!m,
    version: m?.version ?? null,
    endpoints: m?.endpoints?.length ?? 0,
  };
});

export const getPartnerManifest = createServerFn({ method: "GET" }).handler(async () => {
  const { ensureManifest, getManifestCache } = await import("./wwl.server");
  await ensureManifest();
  const c = getManifestCache();
  return {
    version: c?.version ?? null,
    fetchedAt: c?.at ?? null,
    endpoints: c?.raw.endpoints ?? [],
  };
});

// -------- Zod schemas --------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const shortStr = (max = 120) => z.string().trim().min(1).max(max);

const flightsSchema = z
  .object({
    origin: shortStr(10).optional(),
    destination: shortStr(10).optional(),
    depart_date: isoDate.optional(),
    return_date: isoDate.optional(),
    legs: z
      .array(
        z.object({
          origin: shortStr(10),
          destination: shortStr(10),
          date: isoDate,
          preferredTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional(),
        }),
      )
      .min(1)
      .max(6)
      .optional(),
    trip_type: z.enum(["one_way", "round_trip", "multi_city"]).optional(),
    passengers: z.number().int().min(1).max(9).optional(),
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  })
  .strict()
  .refine((v) => (v.legs && v.legs.length > 0) || (v.origin && v.destination && v.depart_date), {
    message: "Provide either origin+destination+depart_date or legs[]",
  });

const hotelsSchema = z
  .object({
    destination: shortStr(120),
    check_in: isoDate,
    check_out: isoDate,
    guests: z.number().int().min(1).max(20).optional(),
    rooms: z.number().int().min(1).max(10).optional(),
  })
  .strict();

const activitiesSchema = z
  .object({
    destination: shortStr(120),
    date: isoDate.optional(),
    travelers: z.number().int().min(1).max(30).optional(),
    category: shortStr(60).optional(),
  })
  .strict();

const transfersSchema = z
  .object({
    pickup: shortStr(200),
    dropoff: shortStr(200),
    date: isoDate,
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    passengers: z.number().int().min(1).max(50).optional(),
    vehicle: shortStr(60).optional(),
  })
  .strict();

const busesSchema = z
  .object({
    origin: shortStr(120),
    destination: shortStr(120),
    date: isoDate,
    passengers: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const privateJetsSchema = z
  .object({
    origin: shortStr(20),
    destination: shortStr(20),
    depart_date: isoDate,
    return_date: isoDate.optional(),
    passengers: z.number().int().min(1).max(20),
    aircraft: shortStr(60).optional(),
  })
  .strict();

const tripBuilderSchema = z
  .object({
    destination: shortStr(200),
    start_date: isoDate,
    end_date: isoDate,
    travelers: z.number().int().min(1).max(30),
    budget: z.number().nonnegative().max(1_000_000_000).optional(),
    interests: z.array(shortStr(60)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const conciergeSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    session_id: z.string().max(120).optional(),
    conversation_id: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/).optional(),
    context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

const lookupSchema = z
  .object({
    kind: z.enum(["airports", "cities", "locations"]),
    query: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(25).optional(),
  })
  .strict();

// -------- Partner lookup (no auth: powers autocomplete) --------
export const lookupPartner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => lookupSchema.parse(d))
  .handler(async ({ data }): Promise<PartnerLookupResult> => {
    const { callPartnerLookup } = await import("./wwl.server");
    return callPartnerLookup(data.kind, data.query, data.limit);
  });

// -------- Search / quote / concierge (auth required) --------
export const searchFlights = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => flightsSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner, toResolvedPartnerFlightPayload } = await import("./wwl.server");
    return callPartner("flights", await toResolvedPartnerFlightPayload(data));
  });

export const searchHotels = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => hotelsSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner, toPartnerHotelPayload } = await import("./wwl.server");
    return callPartner("hotels", toPartnerHotelPayload(data));
  });

export const searchActivities = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => activitiesSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner } = await import("./wwl.server");
    return callPartner("activities", data);
  });

export const searchTransfers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => transfersSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner, toPartnerTransferPayload } = await import("./wwl.server");
    return callPartner("transfers", toPartnerTransferPayload(data));
  });

/** Server-side AI entitlement: Elite tiers or business roles only. */
async function assertAiEntitlement(ctx: { supabase: any; userId: string }) {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("tier")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tier = (profile?.tier as string | null) ?? "traveler";
  if (tier === "elite" || tier === "elite_plus") return;
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const allowed = new Set(["agent", "admin", "super_admin", "b2b"]);
  if ((roles ?? []).some((r: { role: string }) => allowed.has(r.role))) return;
  throw new Error("This feature is reserved for Worldway Elite members.");
}

export const buildTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tripBuilderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAiEntitlement(context);
    const { callPartner } = await import("./wwl.server");
    return callPartner("tripBuilder", data);
  });

export const searchBuses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => busesSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner } = await import("./wwl.server");
    return callPartner("buses", data);
  });

export const quotePrivateJet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => privateJetsSchema.parse(d))
  .handler(async ({ data }) => {
    const { callPartner, toResolvedPartnerPrivateJetPayload } = await import("./wwl.server");
    return callPartner("privateJets", await toResolvedPartnerPrivateJetPayload(data));
  });

export const conciergeChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => conciergeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAiEntitlement(context);
    // Worldway-AetherCore (Azure AI Foundry) answers the Concierge.
    const { askAetherCore, AetherCoreError } = await import("./ai/aethercore.server");
    try {
      const r = await askAetherCore(data.message, data.session_id, data.conversation_id);
      return { ok: true as const, data: { reply: r.reply, session_id: r.sessionId, conversation_id: r.conversationId } };
    } catch (e) {
      if (e instanceof AetherCoreError) return { ok: false as const, error: e.userMessage };
      return { ok: false as const, error: "The concierge is temporarily unavailable. Please try again shortly." };
    }
  });

/** Staff-only AetherCore configuration check (no credential values). */
export const aetherCoreHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff } = await (context.supabase as any).rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden");
    const { configStatus } = await import("./ai/aethercore.server");
    return configStatus();
  });

// -------- Wallet --------
export const WALLET_LIMITS: Record<string, number> = {
  INR: 2_000_000_000,
  USD: 24_000_000,
  EUR: 22_000_000,
  GBP: 19_000_000,
  AED: 88_000_000,
  SGD: 32_000_000,
  AUD: 36_000_000,
};
export const WALLET_CURRENCIES = Object.keys(WALLET_LIMITS);

const topupSchema = z
  .object({
    amount: z.number().positive().finite(),
    currency: z.enum(WALLET_CURRENCIES as [string, ...string[]]),
    method: z.enum(["razorpay", "paypal"]),
    clientEmail: z.string().email().max(255),
    clientName: z.string().trim().min(1).max(120),
  })
  .refine((v) => v.amount <= (WALLET_LIMITS[v.currency] ?? 0), {
    message: "Amount exceeds wallet limit",
    path: ["amount"],
  });

const clientIdSchema = z.object({ clientEmail: z.string().email().max(255) });

export const walletBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWalletOwner, callPartner } = await import("./wwl.server");
    await assertWalletOwner(context as unknown as AuthCtx, data.clientEmail);
    return callPartner("walletBalance", data);
  });

export const walletTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    clientIdSchema.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertWalletOwner, callPartner } = await import("./wwl.server");
    await assertWalletOwner(context as unknown as AuthCtx, data.clientEmail);
    return callPartner("walletTransactions", data);
  });

export const createTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => topupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWalletOwner, callPartner } = await import("./wwl.server");
    await assertWalletOwner(context as unknown as AuthCtx, data.clientEmail);
    const key = data.method === "razorpay" ? "topupRazorpay" : "topupPaypal";
    return callPartner(key, data);
  });

export const verifyTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        method: z.enum(["razorpay", "paypal"]),
        reference: z.string().min(1).max(200),
        clientEmail: z.string().email().max(255),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertWalletOwner, callPartner } = await import("./wwl.server");
    await assertWalletOwner(context as unknown as AuthCtx, data.clientEmail);
    return callPartner("topupVerify", data);
  });

// -------- Product registry --------
const ENDPOINT_PATHS = {
  flights: "/flights/search",
  hotels: "/hotels/search",
  activities: "/activities/search",
  transfers: "/transfers/search",
  buses: "/buses/search",
  privateJets: "/private-jets/quote",
  tripBuilder: "/trip-builder/build",
  concierge: "/concierge/chat",
} as const;

export type ProductStatus = "live" | "dormant";
export type ProductDef = {
  key: string;
  label: string;
  category: "travel" | "aviation" | "ground" | "planning" | "concierge" | "wallet";
  status: ProductStatus;
  route?: string;
  endpoint?: string;
  note?: string;
};

export const PRODUCT_REGISTRY: ReadonlyArray<ProductDef> = [
  {
    key: "flights",
    label: "Flights",
    category: "travel",
    status: "live",
    route: "/flights",
    endpoint: ENDPOINT_PATHS.flights,
  },
  {
    key: "hotels",
    label: "Hotels",
    category: "travel",
    status: "live",
    route: "/hotels",
    endpoint: ENDPOINT_PATHS.hotels,
  },
  {
    key: "activities",
    label: "Activities & Experiences",
    category: "travel",
    status: "live",
    route: "/activities",
    endpoint: ENDPOINT_PATHS.activities,
  },
  {
    key: "transfers",
    label: "Airport & City Transfers",
    category: "ground",
    status: "live",
    route: "/transfers",
    endpoint: ENDPOINT_PATHS.transfers,
  },
  {
    key: "buses",
    label: "Buses",
    category: "ground",
    status: "live",
    route: "/buses",
    endpoint: ENDPOINT_PATHS.buses,
  },
  {
    key: "privateJets",
    label: "Private Jets",
    category: "aviation",
    status: "live",
    route: "/private-jets",
    endpoint: ENDPOINT_PATHS.privateJets,
  },
  {
    key: "tripBuilder",
    label: "Trip Builder",
    category: "planning",
    status: "live",
    route: "/trip-builder",
    endpoint: ENDPOINT_PATHS.tripBuilder,
  },
  {
    key: "concierge",
    label: "AI Concierge",
    category: "concierge",
    status: "live",
    route: "/concierge",
    endpoint: ENDPOINT_PATHS.concierge,
  },
  {
    key: "cruises",
    label: "Cruises",
    category: "travel",
    status: "dormant",
    note: "Awaiting /cruises/search confirmation",
  },
  {
    key: "rail",
    label: "Rail",
    category: "ground",
    status: "dormant",
    note: "Awaiting /rail/search confirmation",
  },
  {
    key: "carRental",
    label: "Car Rental",
    category: "ground",
    status: "dormant",
    note: "Awaiting /car-rental/search confirmation",
  },
  {
    key: "villas",
    label: "Luxury Villas",
    category: "travel",
    status: "dormant",
    note: "Awaiting /villas/search confirmation",
  },
  {
    key: "yachts",
    label: "Yacht Charters",
    category: "aviation",
    status: "dormant",
    note: "Awaiting /yachts/quote confirmation",
  },
  {
    key: "visa",
    label: "Visa Assistance",
    category: "planning",
    status: "dormant",
    note: "Awaiting /visa/apply confirmation",
  },
  {
    key: "insurance",
    label: "Travel Insurance",
    category: "planning",
    status: "dormant",
    note: "Awaiting /insurance/quote confirmation",
  },
];

function makeDormantFn(productKey: string) {
  return createServerFn({ method: "POST" })
    .inputValidator((d: unknown) => (d ?? {}) as Record<string, unknown>)
    .handler(
      async (): Promise<PartnerResult> => ({
        ok: false,
        status: 501,
        error: `Product "${productKey}" is coming soon — awaiting official partner API confirmation.`,
      }),
    );
}

export const searchCruises = makeDormantFn("cruises");
export const searchRail = makeDormantFn("rail");
export const searchCarRental = makeDormantFn("carRental");
export const searchVillas = makeDormantFn("villas");
export const quoteYacht = makeDormantFn("yachts");
export const applyVisa = makeDormantFn("visa");
export const quoteInsurance = makeDormantFn("insurance");

export function validateProductRegistry(): { total: number; live: number; dormant: number } {
  const keys = new Set<string>();
  for (const p of PRODUCT_REGISTRY) {
    if (keys.has(p.key)) throw new Error(`Duplicate product key: ${p.key}`);
    keys.add(p.key);
    if (p.status === "live") {
      if (!p.endpoint) throw new Error(`Live product "${p.key}" is missing endpoint`);
      if (!p.route || !p.route.startsWith("/"))
        throw new Error(`Live product "${p.key}" has invalid route`);
    } else {
      if (p.endpoint) throw new Error(`Dormant product "${p.key}" must not declare an endpoint`);
    }
  }
  return {
    total: PRODUCT_REGISTRY.length,
    live: PRODUCT_REGISTRY.filter((p) => p.status === "live").length,
    dormant: PRODUCT_REGISTRY.filter((p) => p.status === "dormant").length,
  };
}
