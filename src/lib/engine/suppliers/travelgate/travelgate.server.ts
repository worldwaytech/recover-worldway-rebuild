import type { CanonicalOffer } from "../../normalize";
import { localToInstant, airportTz } from "../live-search.server";

export interface TravelgateHotelOption {
  id?: string;
  hotelCode?: string;
  hotelCodeSupplier?: string;
  hotelName?: string;
  price?: {
    gross?: { amount?: number; currency?: string };
    net?: { amount?: number; currency?: string };
  };
  cancelPolicy?: { refundable?: boolean };
}

export interface TravelgateHotelSearchInput {
  cityIata: string;
  checkin: string;
  checkout: string;
}

export function travelgateHotelsToCanonical(
  options: TravelgateHotelOption[],
  input: TravelgateHotelSearchInput,
  observedAt: string,
): CanonicalOffer[] {
  const place = airportTz(input.cityIata);
  if (!place) return [];
  const start = localToInstant(`${input.checkin} 00:00`, place.tz);
  const end = localToInstant(`${input.checkout} 00:00`, place.tz);
  if (!start || !end) return [];

  return options
    .filter((o) => Boolean(o.id || o.hotelCode) && (o.price?.net?.amount ?? o.price?.gross?.amount ?? 0) > 0)
    .map((o) => {
      const money = o.price?.net?.amount != null && o.price.net.currency ? o.price.net : o.price?.gross;
      return {
        supplierKey: "travelgate",
        kind: "stay" as const,
        externalId: o.id || `${o.hotelCodeSupplier || o.hotelCode}:${input.checkin}:${input.checkout}`,
        title: o.hotelName || `Hotel ${o.hotelCode || "unknown"}`,
        start: { at: start, timezone: place.tz, place: input.cityIata, lat: place.lat, lng: place.lng },
        end: { at: end, timezone: place.tz, place: input.cityIata, lat: place.lat, lng: place.lng },
        net: { amount: money!.amount!, currency: money!.currency! },
        refundable: o.cancelPolicy?.refundable === true,
        observedAt,
      };
    });
}
