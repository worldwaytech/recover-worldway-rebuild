// Customer portal data access — Lovable Cloud backed, RLS scoped to auth.uid().
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Trip = Tables<"trips">;
export type Booking = Tables<"bookings">;
export type SavedItem = Tables<"saved_items">;
export type Traveller = Tables<"travellers">;
export type MemberDocument = Tables<"documents">;
export type NotificationPrefs = Tables<"notification_preferences">;

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("You need to sign in to view this.");
  return id;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const accountApi = {
  async trips(): Promise<Trip[]> {
    return unwrap(
      await supabase.from("trips").select("*").order("start_date", { ascending: true }),
    );
  },
  async addTrip(input: Omit<TablesInsert<"trips">, "user_id">): Promise<Trip> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("trips")
      .insert({ ...input, user_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeTrip(id: string) {
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async bookings(): Promise<Booking[]> {
    return unwrap(
      await supabase.from("bookings").select("*").order("travel_date", { ascending: false }),
    );
  },

  async addBooking(input: Omit<TablesInsert<"bookings">, "user_id">): Promise<Booking> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("bookings")
      .insert({ ...input, user_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async saved(): Promise<SavedItem[]> {
    return unwrap(
      await supabase.from("saved_items").select("*").order("created_at", { ascending: false }),
    );
  },
  async removeSaved(id: string) {
    const { error } = await supabase.from("saved_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async travellers(): Promise<Traveller[]> {
    return unwrap(await supabase.from("travellers").select("*").order("full_name"));
  },
  async addTraveller(input: Omit<TablesInsert<"travellers">, "user_id">): Promise<Traveller> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("travellers")
      .insert({ ...input, user_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeTraveller(id: string) {
    const { error } = await supabase.from("travellers").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async documents(): Promise<MemberDocument[]> {
    return unwrap(
      await supabase.from("documents").select("*").order("created_at", { ascending: false }),
    );
  },
  async addDocument(input: Omit<TablesInsert<"documents">, "user_id">): Promise<MemberDocument> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("documents")
      .insert({ ...input, user_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async removeDocument(id: string) {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async prefs(): Promise<NotificationPrefs> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    const created = await supabase
      .from("notification_preferences")
      .insert({ user_id })
      .select()
      .single();
    if (created.error) throw new Error(created.error.message);
    return created.data;
  },
  async savePrefs(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("notification_preferences")
      .update(patch)
      .eq("user_id", user_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
