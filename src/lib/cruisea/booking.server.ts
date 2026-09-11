import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CruiseaBooking, CruiseaFilters } from "./types";
import { revalidateCruiseaCabin } from "./catalogue.server";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

const HOLD_MINUTES = 60 * 48;

function reference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `CRA-${code}`;
}

type BookingRow = Database["public"]["Tables"]["cruisea_bookings"]["Row"] & {
  cruisea_sailings?: Database["public"]["Tables"]["cruisea_sailings"]["Row"] | null;
  cruisea_cabins?: Database["public"]["Tables"]["cruisea_cabins"]["Row"] | null;
  cruisea_booking_passengers?: Database["public"]["Tables"]["cruisea_booking_passengers"]["Row"][];
};

const BOOKING_SELECT = `*,
  cruisea_sailings ( * ),
  cruisea_cabins ( * ),
  cruisea_booking_passengers ( id, first_name, last_name, date_of_birth )`;

function mapBooking(row: BookingRow): CruiseaBooking {
  const sailing = row.cruisea_sailings ?? null;
  const cabin = row.cruisea_cabins ?? null;
  return {
    id: row.id,
    reference: row.booking_reference,
    status: row.status,
    paymentStatus: row.payment_status,
    guestCount: row.guest_count,
    totalPrice: Number(row.total_price),
    currency: row.currency,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes,
    holdExpiresAt: row.hold_expires_at,
    createdAt: row.created_at,
    sailing: sailing
      ? {
          id: sailing.id,
          title: sailing.title,
          cruiseLine: sailing.cruise_line,
          shipName: sailing.ship_name,
          cruiseType: sailing.cruise_type,
          region: sailing.region,
          country: sailing.country,
          embarkationPort: sailing.embarkation_port,
          disembarkationPort: sailing.disembarkation_port,
          departureDate: sailing.departure_date,
          durationNights: sailing.duration_nights,
          description: sailing.description,
          highlights: sailing.highlights ?? [],
          imageUrl: sailing.image_url,
          areaTags: sailing.area_tags ?? [],
          packageOptions: sailing.package_options ?? [],
        }
      : null,
    cabin: cabin
      ? {
          id: cabin.id,
          category: cabin.category,
          label: cabin.label,
          pricePerGuest: Number(cabin.price_per_guest),
        }
      : null,
    passengers: (row.cruisea_booking_passengers ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      dateOfBirth: p.date_of_birth,
    })),
  };
}

/**
 * Claim one cabin from live inventory with optimistic concurrency: the update only
 * lands when the row still shows the count we read, so two simultaneous holds can
 * never oversell the same cabin. Returns false when no cabin could be claimed.
 */
async function claimInventory(cabinId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await supabaseAdmin
      .from("cruisea_cabins")
      .select("available_inventory")
      .eq("id", cabinId)
      .maybeSingle();
    if (!data) return false;
    const current = data.available_inventory ?? 0;
    if (current < 1) return false;
    const { data: claimed } = await supabaseAdmin
      .from("cruisea_cabins")
      .update({ available_inventory: current - 1 })
      .eq("id", cabinId)
      .eq("available_inventory", current)
      .select("id")
      .maybeSingle();
    if (claimed) return true;
  }
  return false;
}

/** Return one cabin to live inventory after a cancellation or a failed hold. */
async function releaseInventory(cabinId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await supabaseAdmin
      .from("cruisea_cabins")
      .select("available_inventory")
      .eq("id", cabinId)
      .maybeSingle();
    if (!data) return;
    const current = data.available_inventory ?? 0;
    const { data: released } = await supabaseAdmin
      .from("cruisea_cabins")
      .update({ available_inventory: current + 1 })
      .eq("id", cabinId)
      .eq("available_inventory", current)
      .select("id")
      .maybeSingle();
    if (released) return;
  }
}


export type CruiseaBookingInput = {
  sailingId: string;
  cabinId: string;
  guests: number;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  notes?: string;
  passengers?: { firstName: string; lastName: string; dateOfBirth?: string }[];
};

/** Hold a cabin: revalidates live price/inventory, then writes the booking as Held. */
export async function createCruiseaBooking(ctx: Ctx, input: CruiseaBookingInput) {
  const availability = await revalidateCruiseaCabin({
    sailingId: input.sailingId,
    cabinId: input.cabinId,
    guests: input.guests,
  });
  if (!availability.available) {
    throw new Error(availability.reason ?? "That cabin grade is no longer available.");
  }

  // Claim inventory first so two simultaneous holds cannot take the same last cabin.
  const claimed = await claimInventory(input.cabinId);
  if (!claimed) {
    throw new Error("That cabin grade has just sold out. Please choose another grade.");
  }

  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
  const { data, error } = await ctx.supabase
    .from("cruisea_bookings")
    .insert({
      user_id: ctx.userId,
      sailing_id: input.sailingId,
      cabin_id: input.cabinId,
      status: "Held",
      guest_count: availability.guests,
      total_price: availability.totalPrice,
      net_price: availability.totalPrice,
      commission_amount: 0,
      currency: availability.currency,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone ?? null,
      notes: input.notes ?? null,
      booking_reference: reference(),
      payment_status: "Pending",
      hold_expires_at: holdExpiresAt,
    })
    .select(BOOKING_SELECT)
    .single();
  if (error) {
    // Never keep a claimed cabin when the booking row could not be written.
    await releaseInventory(input.cabinId);
    throw new Error(error.message);
  }


  const passengers = (input.passengers ?? []).filter((p) => p.firstName && p.lastName);
  if (passengers.length) {
    await ctx.supabase.from("cruisea_booking_passengers").insert(
      passengers.map((p) => ({
        booking_id: (data as BookingRow).id,
        user_id: ctx.userId,
        first_name: p.firstName,
        last_name: p.lastName,
        date_of_birth: p.dateOfBirth ?? null,
      })),
    );
  }

  return mapBooking(data as BookingRow);
}

/** Confirm a held booking once the guest accepts the reconfirmed price. */
export async function confirmCruiseaBooking(ctx: Ctx, bookingId: string) {
  const { data: existing, error: loadError } = await ctx.supabase
    .from("cruisea_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Booking not found.");
  if (existing.status === "Cancelled") throw new Error("This booking has been cancelled.");
  if (existing.hold_expires_at && new Date(existing.hold_expires_at) < new Date()) {
    throw new Error("This hold has expired. Please search again and re-hold your cabin.");
  }

  const { data, error } = await ctx.supabase
    .from("cruisea_bookings")
    .update({ status: "Confirmed", payment_status: "Awaiting payment", hold_expires_at: null })
    .eq("id", bookingId)
    .eq("user_id", ctx.userId)
    .select(BOOKING_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapBooking(data as BookingRow);
}

export async function cancelCruiseaBooking(ctx: Ctx, bookingId: string) {
  const { data: existing } = await ctx.supabase
    .from("cruisea_bookings")
    .select("cabin_id, status")
    .eq("id", bookingId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!existing) throw new Error("Booking not found.");
  if (existing.status === "Cancelled") throw new Error("This booking is already cancelled.");

  // Only the caller that actually transitions the row out of Held/Confirmed releases
  // the cabin, so a double-click can never hand back inventory twice.
  const { data, error } = await ctx.supabase
    .from("cruisea_bookings")
    .update({ status: "Cancelled", payment_status: "Cancelled", hold_expires_at: null })
    .eq("id", bookingId)
    .eq("user_id", ctx.userId)
    .neq("status", "Cancelled")
    .select(BOOKING_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This booking is already cancelled.");

  await releaseInventory(existing.cabin_id);
  return mapBooking(data as BookingRow);

}

export async function listCruiseaBookings(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("cruisea_bookings")
    .select(BOOKING_SELECT)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as BookingRow[]).map(mapBooking);
}

export async function getCruiseaBooking(ctx: Ctx, bookingId: string) {
  const { data, error } = await ctx.supabase
    .from("cruisea_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBooking(data as BookingRow) : null;
}

export async function addCruiseaPassenger(
  ctx: Ctx,
  input: { bookingId: string; firstName: string; lastName: string; dateOfBirth?: string },
) {
  const { data: booking } = await ctx.supabase
    .from("cruisea_bookings")
    .select("id")
    .eq("id", input.bookingId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  const { error } = await ctx.supabase.from("cruisea_booking_passengers").insert({
    booking_id: input.bookingId,
    user_id: ctx.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    date_of_birth: input.dateOfBirth ?? null,
  });
  if (error) throw new Error(error.message);
  return getCruiseaBooking(ctx, input.bookingId);
}

export async function listCruiseaSavedSearches(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("cruisea_saved_searches")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveCruiseaSearch(ctx: Ctx, input: { name: string; filters: CruiseaFilters }) {
  const f = input.filters;
  const { data, error } = await ctx.supabase
    .from("cruisea_saved_searches")
    .insert({
      user_id: ctx.userId,
      name: input.name,
      query: f.query ?? null,
      cruise_type: f.cruiseType ?? null,
      region: f.region ?? null,
      company: f.company ?? null,
      ship: f.ship ?? null,
      duration: f.duration ?? null,
      departure_date: f.departureDate ?? null,
      departure_window: f.departureMonth ?? null,
      package_filters: f.packageOptions ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCruiseaSavedSearch(ctx: Ctx, id: string) {
  const { error } = await ctx.supabase
    .from("cruisea_saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
