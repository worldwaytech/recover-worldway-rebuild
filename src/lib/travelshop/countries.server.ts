// Partner's authoritative phone-country list (GET /apiv1/b2c/countries/list).
// Fetched live and cached; never hard-coded.
import { travelshopRequest } from "./client.server";
import type { PartnerCountry } from "./booking-contract";

let cache: { at: number; list: PartnerCountry[] } | null = null;
const TTL = 6 * 60 * 60 * 1000;

export async function partnerCountries(): Promise<PartnerCountry[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  const r = await travelshopRequest<{ data?: PartnerCountry[] }>("/apiv1/b2c/countries/list", { maxRetries: 6 });
  const list = (r.data ?? []).filter((c) => Number.isInteger(c.id) && typeof c.phone_code === "string");
  if (list.length) cache = { at: Date.now(), list };
  return list;
}
