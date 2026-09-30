// Tour booking certification — SERVER ONLY. Derived solely from real evidence:
// a partner-confirmed booking (reference returned by the live partner API)
// that followed a verified Worldway payment. Certified per pricing kind, so
// room-priced tours need their own real confirmed booking.
export type TourKind = "per_person" | "room";
export const kindOf = (rooms: unknown): TourKind => (Array.isArray(rooms) && rooms.length > 0 ? "room" : "per_person");

export async function certificationStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data: booked } = await db.from("travelshop_bookings")
    .select("id, rooms, supplier_reference_id, updated_at")
    .eq("status", "supplier_booked").not("supplier_reference_id", "is", null).limit(200);
  const out: Record<TourKind, { certified: boolean; bookingId: string | null; at: string | null }> = {
    per_person: { certified: false, bookingId: null, at: null },
    room: { certified: false, bookingId: null, at: null },
  };
  for (const b of booked ?? []) {
    const k = kindOf(b.rooms);
    if (out[k].certified) continue;
    const { data: paid } = await db.from("payments").select("id").eq("purpose", "tour").eq("status", "paid")
      .contains("reference", { tour_booking_id: b.id }).limit(1).maybeSingle();
    if (paid) out[k] = { certified: true, bookingId: b.id, at: b.updated_at };
  }
  return out;
}
