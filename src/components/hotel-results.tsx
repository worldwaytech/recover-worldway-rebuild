import { useMemo } from "react";
import { mediaUrl } from "@/lib/media";

type Room = {
  price?: number;
  currency?: string;
  roomType?: string;
  boardBasis?: string;
  refundable?: boolean;
};
type Hotel = {
  name?: string;
  city?: string;
  country?: string;
  starRating?: number;
  propertyType?: string;
  currency?: string;
  totalPrice?: number;
  source?: string;
  rooms?: Room[];
  image?: string;
  images?: string[];
  thumbnail?: string;
  address?: string;
};
type HotelPayload = { hotels?: Hotel[]; message?: string } | null | undefined | unknown;

function readHotels(data: unknown): Hotel[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const nested =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const direct = d.hotels ?? d.properties ?? d.results ?? d.items;
  const inner = nested
    ? (nested.hotels ?? nested.properties ?? nested.results ?? nested.items)
    : undefined;
  const value = Array.isArray(direct) ? direct : Array.isArray(inner) ? inner : [];
  return value as Hotel[];
}

function fmtPrice(v?: number, c?: string) {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c || "USD",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${c ?? ""} ${v.toLocaleString()}`.trim();
  }
}

export function HotelResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  const hotels = useMemo<Hotel[]>(() => {
    return readHotels(data as HotelPayload);
  }, [data]);

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">Results</div>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading live inventory…</div>
          ) : null}
          {!loading && hotels.length > 0 ? (
            <div className="text-xs text-muted-foreground">{hotels.length} properties</div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        {!error && !loading && !data ? (
          <div className="text-sm text-muted-foreground">
            Submit the search to see live properties with rooms & rates.
          </div>
        ) : null}

        {!error && data && hotels.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No properties returned for that destination and dates. Try adjusting your search.
          </div>
        ) : null}

        {hotels.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {hotels.map((h, i) => {
              const img = h.image ?? h.thumbnail ?? h.images?.[0];
              const stars = Math.max(0, Math.min(5, Math.round(h.starRating ?? 0)));
              return (
                <article
                  key={`${h.name}-${i}`}
                  className="overflow-hidden rounded-xl border border-border/50 bg-background/40"
                >
                  {img ? (
                    <div
                      className="aspect-[16/9] w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${mediaUrl(img)})` }}
                    />
                  ) : null}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-serif text-lg text-foreground">
                          {h.name ?? "Untitled property"}
                        </h3>
                        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                          {[h.city, h.country, h.propertyType].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg text-primary">
                          {fmtPrice(h.totalPrice, h.currency)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                          from / stay
                        </div>
                      </div>
                    </div>
                    {stars > 0 ? (
                      <div className="mt-2 text-xs text-primary">
                        {"★".repeat(stars)}
                        <span className="text-muted-foreground">{"★".repeat(5 - stars)}</span>
                      </div>
                    ) : null}
                    {h.rooms && h.rooms.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {h.rooms.slice(0, 3).map((r, ri) => (
                          <li
                            key={ri}
                            className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0 truncate text-foreground">
                              {r.roomType ?? "Room"}{" "}
                              <span className="text-muted-foreground">
                                · {r.boardBasis ?? "Room only"}
                              </span>
                              {r.refundable ? (
                                <span className="ml-2 text-emerald-500">Refundable</span>
                              ) : null}
                            </div>
                            <div className="ml-3 shrink-0 text-primary">
                              {fmtPrice(r.price, r.currency ?? h.currency)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {h.source ? (
                      <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Source · {h.source}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
