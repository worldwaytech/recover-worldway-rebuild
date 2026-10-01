// HBX Transfers server functions. Thin wrappers — supplier code and
// credentials stay server-side; customer-facing errors are neutral.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const pointType = z.enum(["ATLAS", "IATA", "PORT", "STATION", "GIATA", "GPS"]);
const pointSchema = z.object({ type: pointType, code: z.string().min(1).max(40), name: z.string().max(200).nullish() });
const localDt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);

/** Public pickup/drop-off lookup over synchronised transfer content. */
export const searchTransferPoints = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const env = (process.env["HBX_ENVIRONMENT"] ?? "test").toLowerCase() === "live" ? "live" : "test";
    const q = data.q.replace(/[%_,()]/g, " ");
    const codeLike = /^[A-Za-z0-9]{2,10}$/.test(data.q) ? data.q.toUpperCase() : null;
    let sel = sb
      .from("hbx_transfer_points")
      .select("code,point_type,name,city,country_code,latitude,longitude")
      .eq("environment", env)
      .limit(20);
    sel = codeLike ? sel.or(`name.ilike.%${q}%,code.eq.${codeLike}`) : sel.ilike("name", `%${q}%`);
    const { data: rows } = await sel.order("point_type", { ascending: false });
    return (rows ?? []).map((r) => ({
      type: r.point_type as string,
      code: r.code as string,
      name: r.name as string,
      city: (r.city as string | null) ?? null,
      country: (r.country_code as string | null) ?? null,
      lat: r.latitude as number | null,
      lng: r.longitude as number | null,
    }));
  });

const availabilitySchema = z.object({
  from: pointSchema,
  to: pointSchema,
  outbound: localDt,
  inbound: localDt.nullish(),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(10),
  infants: z.number().int().min(0).max(10),
});

/** Public live availability search. */
export const searchTransferAvailability = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => availabilitySchema.parse(d))
  .handler(async ({ data }) => {
    const { fetchTransferAvailability } = await import("./transfers.server");
    try {
      const res = await fetchTransferAvailability({ ...data, inbound: data.inbound ?? null });
      if (!res.ok) {
        return { ok: false as const, error: res.status === 204 || res.status === 404 ? "No transfers are available for this search." : "Live transfer availability is temporarily unavailable.", data: null };
      }
      return { ok: true as const, error: null, data: res.data ?? null };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Search failed.", data: null };
    }
  });

const legSchema = z.object({
  rateKey: z.string().min(10).max(1000),
  direction: z.enum(["ARRIVAL", "DEPARTURE"]),
  transportType: z.enum(["FLIGHT", "TRAIN", "CRUISE"]),
  transportCode: z.string().trim().min(1).max(40),
  companyName: z.string().trim().max(60).nullish(),
  extras: z.array(z.object({ code: z.string().max(10), units: z.number().int().min(1).max(20) })).max(10).optional(),
  gps: z.object({ pickupAddress: z.string().max(200).nullish(), dropoffAddress: z.string().max(200).nullish() }).nullish(),
});

/** Authenticated booking. Creates exactly one supplier booking per idempotency key. */
export const bookTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        idempotencyKey: z.string().uuid(),
        title: z.string().max(200),
        travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        holder: z.object({
          name: z.string().trim().min(1).max(50),
          surname: z.string().trim().min(1).max(50),
          email: z.string().email().max(120),
          phone: z.string().trim().min(6).max(20),
        }),
        legs: z.array(legSchema).min(1).max(2),
        remark: z.string().max(500).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bookTransferForUser } = await import("./transfer-booking.server");
    return bookTransferForUser(
      context.userId,
      { holder: data.holder, legs: data.legs, remark: data.remark ?? null },
      data.idempotencyKey,
      data.title,
      data.travelDate ?? null,
    );
  });

/** Owner-only voucher + booking view. */
export const getMyTransferBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().regex(/^WWT[A-Z0-9]{4,12}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("bookings")
      .select("reference,status,supplier_reference,supplier_status,amount,currency,travel_date,title,details,created_at")
      .eq("reference", data.reference)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!b) return null;
    const details = (b.details ?? {}) as { voucher?: unknown };
    return {
      reference: b.reference,
      status: b.status,
      supplierReference: b.supplier_reference,
      supplierStatus: b.supplier_status,
      amount: b.amount,
      currency: b.currency,
      travelDate: b.travel_date,
      title: b.title,
      // Contractual HBX voucher: exempt from the supplier-privacy rewording (owner-only).
      contractualVoucher: (details.voucher ?? null) as import("./transfer-model").TransferVoucher | null,
    };
  });

export const cancelMyTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().regex(/^WWT[A-Z0-9]{4,12}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelTransferForUser } = await import("./transfer-booking.server");
    return cancelTransferForUser(context.userId, data.reference);
  });

async function assertAdmin(context: unknown) {
  const { isAdmin } = await import("@/lib/wwl.server");
  if (!(await isAdmin(context as never))) throw new Error("Forbidden");
}

/** Admin: supplier booking list. */
export const adminListTransferBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateType: z.enum(["CREATION_DATE", "FROM_DATE"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { listTransferBookings } = await import("./transfers.server");
    const res = await listTransferBookings(data);
    return { ok: res.ok, status: res.status, bookings: res.data ?? [], error: res.error?.message ?? null };
  });

/** Admin: run the HBX TEST transfer certification scenarios. */
export const runHbxTransferCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runTransferCertification } = await import("./transfer-booking.server");
    return runTransferCertification(data);
  });
