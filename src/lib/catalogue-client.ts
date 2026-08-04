// Client-side catalogue services: analytics, recent searches, wishlist, quote requests.
import { supabase } from "@/integrations/supabase/client";
import type { CatalogueProduct } from "./catalogue-types";

export type CatalogueEventType =
  | "collection_view"
  | "product_view"
  | "search"
  | "filter_used"
  | "cta_click"
  | "quote_request"
  | "booking_conversion"
  | "ai_assisted_conversion";

export function trackCatalogueEvent(
  event_type: CatalogueEventType,
  payload: { kind?: string; slug?: string; query?: string; filters?: Record<string, unknown> } = {},
) {
  if (typeof window === "undefined") return;
  void supabase
    .from("catalogue_events")
    .insert({
      event_type,
      kind: payload.kind ?? null,
      slug: payload.slug ?? null,
      query: payload.query ?? null,
      filters: (payload.filters ?? {}) as never,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

const RECENT_KEY = "wwtg:recent-searches";

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(q: string) {
  if (typeof window === "undefined") return;
  const term = q.trim();
  if (!term) return;
  const next = [
    term,
    ...getRecentSearches().filter((s) => s.toLowerCase() !== term.toLowerCase()),
  ].slice(0, 8);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export function clearRecentSearches() {
  if (typeof window !== "undefined") window.localStorage.removeItem(RECENT_KEY);
}

export interface QuoteRequestInput {
  full_name: string;
  email: string;
  phone?: string;
  travel_month?: string;
  party_size?: number;
  budget?: string;
  message?: string;
}

export async function submitQuoteRequest(product: CatalogueProduct, input: QuoteRequestInput) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("quote_requests").insert({
    user_id: auth.user?.id ?? null,
    product_kind: product.kind,
    product_slug: product.slug,
    product_title: product.title,
    ...input,
  });
  if (error) throw new Error(error.message);
  trackCatalogueEvent("quote_request", { kind: product.kind, slug: product.slug });
}

export async function saveToWishlist(product: CatalogueProduct) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to save this to your wishlist.");
  const { error } = await supabase.from("saved_items").insert({
    user_id: auth.user.id,
    item_type: product.kind,
    label: product.title,
    details: {
      slug: product.slug,
      path: `${product.detailBase}/${product.slug}`,
      location: product.location,
      priceFrom: product.priceFrom ?? null,
      image: product.image,
    } as never,
  });
  if (error) throw new Error(error.message);
}
