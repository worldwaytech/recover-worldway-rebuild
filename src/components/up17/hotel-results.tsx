import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { up17HotelDetailLookup } from "@/lib/up17/up17.functions";
import { mediaUrl } from "@/lib/media";

/** Supplier CDNs 403 browser-origin requests; stream them through our proxy. */
function proxied(url: string): string {
  if (!/^https?:\/\//.test(url)) return url;
  return `/api/public/supplier-image?url=${encodeURIComponent(url)}`;
}

type Room = {
  roomType: string;
  boardBasis: string;
  refundable: boolean;
  price: number | null;
  currency: string;
};

type Hotel = {
  resultIndex: string;
  hotelCode: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  category: string;
  address: string;
  description: string;
  image: string;
  gallery: string[];
  amenities: string[];
  latitude: number | null;
  longitude: number | null;
  supplier: string;
  promotion: string;
  hotDeal: boolean;
  currency: string;
  totalPrice: number | null;
  roomPrice: number | null;
  tax: number | null;
  rooms: Room[];
};

function fmtPrice(v?: number | null, c?: string) {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: c || "INR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${c ?? ""} ${v.toLocaleString()}`.trim();
  }
}

function readState(data: unknown): { hotels: Hotel[]; token: string | null; cityName: string } {
  if (!data || typeof data !== "object") return { hotels: [], token: null, cityName: "" };
  const d = data as Record<string, unknown>;
  return {
    hotels: Array.isArray(d.hotels) ? (d.hotels as Hotel[]) : [],
    token: typeof d.searchTokenId === "string" ? d.searchTokenId : null,
    cityName: typeof d.cityName === "string" ? d.cityName : "",
  };
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
  }`;

export function Up17HotelResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  const { hotels, token, cityName } = useMemo(() => readState(data), [data]);
  const [stars, setStars] = useState<number[]>([]);
  const [sort, setSort] = useState<"price" | "rating">("price");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const priceRange = useMemo(() => {
    const values = hotels.map((h) => h.totalPrice).filter((v): v is number => v !== null);
    return values.length
      ? { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) }
      : { min: 0, max: 0 };
  }, [hotels]);

  const starFacets = useMemo(
    () => [...new Set(hotels.map((h) => Math.round(h.starRating)).filter((s) => s > 0))].sort((a, b) => b - a),
    [hotels],
  );

  const visible = useMemo(() => {
    const cap = maxPrice ?? priceRange.max;
    const list = hotels.filter((h) => {
      if (stars.length && !stars.includes(Math.round(h.starRating))) return false;
      if (h.totalPrice !== null && cap && h.totalPrice > cap) return false;
      return true;
    });
    return list.sort((a, b) =>
      sort === "rating"
        ? (b.starRating ?? 0) - (a.starRating ?? 0)
        : (a.totalPrice ?? Infinity) - (b.totalPrice ?? Infinity),
    );
  }, [hotels, stars, maxPrice, priceRange.max, sort]);

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">
            Live Hotels{cityName ? ` · ${cityName}` : ""}
          </div>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading live inventory…</div>
          ) : null}
          {!loading && hotels.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {visible.length} of {hotels.length} properties
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        {!error && !loading && !data ? (
          <div className="text-sm text-muted-foreground">
            Submit the search to see live properties with rooms &amp; rates.
          </div>
        ) : null}

        {!error && data && hotels.length === 0 && !loading ? (
          <div className="text-sm text-muted-foreground">
            No properties returned for that destination and dates. Try adjusting your search.
          </div>
        ) : null}

        {hotels.length > 0 ? (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/50 pb-4">
              {starFacets.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setStars(stars.includes(s) ? stars.filter((v) => v !== s) : [...stars, s])
                  }
                  className={chip(stars.includes(s))}
                >
                  {s}★
                </button>
              ))}
              <button type="button" onClick={() => setSort("price")} className={chip(sort === "price")}>
                Lowest rate
              </button>
              <button type="button" onClick={() => setSort("rating")} className={chip(sort === "rating")}>
                Top rated
              </button>
              {priceRange.max > priceRange.min ? (
                <label className="ml-auto flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Max {fmtPrice(maxPrice ?? priceRange.max, hotels[0]?.currency)}
                  <input
                    type="range"
                    min={priceRange.min}
                    max={priceRange.max}
                    value={maxPrice ?? priceRange.max}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-40 accent-primary"
                  />
                </label>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {visible.map((h, i) => (
                <HotelCard key={`${h.hotelCode}-${i}`} hotel={h} token={token} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function HotelCard({ hotel, token }: { hotel: Hotel; token: string | null }) {
  const loadDetail = useServerFn(up17HotelDetailLookup);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{
    gallery: string[];
    amenities: string[];
    description: string;
    checkInTime: string;
    checkOutTime: string;
  } | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const stars = Math.max(0, Math.min(5, Math.round(hotel.starRating ?? 0)));
  const gallery = detail?.gallery.length ? detail.gallery : hotel.gallery;
  const cover = gallery[0] ?? hotel.image;
  const amenities = detail?.amenities.length ? detail.amenities : hotel.amenities;

  async function toggle() {
    setOpen((v) => !v);
    if (detail || !token || !hotel.resultIndex || !hotel.hotelCode) return;
    const res = await loadDetail({
      data: { resultIndex: hotel.resultIndex, hotelCode: hotel.hotelCode, searchTokenId: token },
    });
    if (res.ok) {
      setDetail({
        gallery: res.gallery,
        amenities: res.amenities,
        description: res.description,
        checkInTime: res.checkInTime,
        checkOutTime: res.checkOutTime,
      });
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-border/50 bg-background/40">
      <div className="relative aspect-[16/9] w-full bg-muted/40">
        {cover && !imgFailed ? (
          <img
            src={mediaUrl(proxied(cover))}
            alt={`${hotel.name} — ${hotel.city}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Image on request
          </div>
        )}
        {hotel.hotDeal ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary-foreground">
            Hot deal
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg text-foreground">
              {hotel.name || "Untitled property"}
            </h3>
            <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {[hotel.city, hotel.country, hotel.category].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg text-primary">{fmtPrice(hotel.totalPrice, hotel.currency)}</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              total stay
            </div>
            {hotel.tax !== null ? (
              <div className="text-[10px] text-muted-foreground">
                incl. taxes {fmtPrice(hotel.tax, hotel.currency)}
              </div>
            ) : null}
          </div>
        </div>

        {stars > 0 ? (
          <div className="mt-2 text-xs text-primary" aria-label={`${stars} star property`}>
            {"★".repeat(stars)}
            <span className="text-muted-foreground">{"★".repeat(5 - stars)}</span>
          </div>
        ) : null}

        {hotel.address ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{hotel.address}</p>
        ) : null}

        {amenities.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {amenities.slice(0, 6).map((a) => (
              <span
                key={a}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {a}
              </span>
            ))}
          </div>
        ) : null}

        {hotel.rooms.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {hotel.rooms.slice(0, 3).map((r, ri) => (
              <li
                key={ri}
                className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2 text-xs"
              >
                <div className="min-w-0 truncate text-foreground">
                  {r.roomType || "Room"}{" "}
                  <span className="text-muted-foreground">· {r.boardBasis || "Room only"}</span>
                  {r.refundable ? <span className="ml-2 text-emerald-500">Refundable</span> : null}
                </div>
                <div className="ml-3 shrink-0 text-primary">
                  {fmtPrice(r.price, r.currency ?? hotel.currency)}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-border px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
          >
            {open ? "Hide details" : "Property details"}
          </button>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Worldway live inventory
          </span>
        </div>

        {open ? (
          <div className="mt-4 border-t border-border/50 pt-4">
            {gallery.length > 1 ? (
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {gallery.slice(1, 7).map((src) => (
                  <img
                    key={src}
                    src={mediaUrl(proxied(src))}
                    alt={`${hotel.name} gallery image`}
                    loading="lazy"
                    className="h-20 w-32 shrink-0 rounded-md object-cover"
                  />
                ))}
              </div>
            ) : null}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {detail?.description || hotel.description || "Details available on request."}
            </p>
            {detail?.checkInTime ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Check-in {detail.checkInTime} · Check-out {detail.checkOutTime}
              </p>
            ) : null}
            {amenities.length > 6 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {amenities.slice(6).map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
