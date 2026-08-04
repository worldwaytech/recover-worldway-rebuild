import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { up17BaggageLookup, up17FareRuleLookup } from "@/lib/up17/up17.functions";

type Baggage = {
  tier: number;
  code: string;
  label: string;
  weightKg: number | null;
  price: number | null;
  currency: string;
};

type Fare = {
  currency: string;
  total: number | null;
  base: number | null;
  tax: number | null;
  published: number | null;
  offered: number | null;
};

export type FareOption = {
  fareId: string;
  fareType: string;
  fareName: string;
  source: string;
  cabinClass: string;
  refundable: boolean | null;
  inclusions: string[];
  airlineRemark: string;
  checkInBaggage: string | null;
  cabinBaggage: string | null;
  seatsAvailable: number | null;
  fare: Fare;
};

export type Segment = {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  fareClass: string;
  craft: string;
  origin: string;
  originCity: string;
  originTerminal: string;
  destination: string;
  destinationCity: string;
  destinationTerminal: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  layoverMin: number | null;
  tripIndex: number;
};

export type Offer = {
  recommendedRank: number;
  resultIndex: string;
  airline: string;
  airlineCode: string;
  airlineLogo: string;
  flightNumbers: string[];
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  stops: number;
  stopAirports: string[];
  durationMin: number | null;
  refundable: boolean | null;
  cabinClass: string;
  fareType: string;
  source: string;
  checkInBaggage: string | null;
  cabinBaggage: string | null;
  seatsAvailable: number | null;
  fare: Fare;
  fares: FareOption[];
  segments: Segment[];
  baggageOptions: Baggage[];
};

function money(amount: number | null, currency: string) {
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function clock(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function duration(min: number | null) {
  if (!min) return "—";
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function hourOf(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

const TIME_BANDS = [
  { key: "early", label: "Before 06:00", test: (h: number) => h < 6 },
  { key: "morning", label: "06:00 – 12:00", test: (h: number) => h >= 6 && h < 12 },
  { key: "afternoon", label: "12:00 – 18:00", test: (h: number) => h >= 12 && h < 18 },
  { key: "evening", label: "After 18:00", test: (h: number) => h >= 18 },
];

type Sort = "recommended" | "cheapest" | "fastest" | "earliest";

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
  }`;

function AirlineLogo({ offer, size = 40 }: { offer: Offer; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!offer.airlineLogo || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[10px] font-semibold tracking-wider text-muted-foreground"
      >
        {offer.airlineCode || "··"}
      </div>
    );
  }
  return (
    <img
      src={offer.airlineLogo}
      alt={`${offer.airline || offer.airlineCode} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 rounded-lg border border-border/60 bg-background/60 object-contain p-1"
    />
  );
}

export function Up17FlightResults({
  offers,
  searchTokenId,
}: {
  offers: Offer[];
  searchTokenId: string | null;
}) {
  const [sort, setSort] = useState<Sort>("recommended");
  const [airlines, setAirlines] = useState<string[]>([]);
  const [stops, setStops] = useState<number[]>([]);
  const [cabins, setCabins] = useState<string[]>([]);
  const [fareTypes, setFareTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [refundableOnly, setRefundableOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const facets = useMemo(() => {
    const airlineMap = new Map<string, { code: string; name: string; logo: string; min: number }>();
    const stopSet = new Set<number>();
    const cabinSet = new Set<string>();
    const fareTypeSet = new Set<string>();
    const sourceSet = new Set<string>();
    const bandSet = new Set<string>();
    let priceMin = Infinity;
    let priceMax = 0;
    let hasRefundable = false;
    for (const o of offers) {
      const total = o.fare.total ?? Infinity;
      if (o.airlineCode) {
        const prev = airlineMap.get(o.airlineCode);
        airlineMap.set(o.airlineCode, {
          code: o.airlineCode,
          name: o.airline || o.airlineCode,
          logo: o.airlineLogo,
          min: Math.min(prev?.min ?? Infinity, total),
        });
      }
      stopSet.add(Math.min(o.stops, 2));
      for (const f of o.fares) {
        if (f.cabinClass) cabinSet.add(f.cabinClass);
        if (f.fareType) fareTypeSet.add(f.fareType);
        if (f.source) sourceSet.add(f.source);
        if (f.refundable) hasRefundable = true;
      }
      const h = hourOf(o.departure);
      if (h !== null) {
        const band = TIME_BANDS.find((b) => b.test(h));
        if (band) bandSet.add(band.key);
      }
      if (o.fare.total !== null) {
        priceMin = Math.min(priceMin, o.fare.total);
        priceMax = Math.max(priceMax, o.fare.total);
      }
    }
    return {
      airlines: [...airlineMap.values()].sort((a, b) => a.min - b.min),
      stops: [...stopSet].sort((a, b) => a - b),
      cabins: [...cabinSet].sort(),
      fareTypes: [...fareTypeSet].sort(),
      sources: [...sourceSet].sort(),
      bands: TIME_BANDS.filter((b) => bandSet.has(b.key)),
      priceMin: Number.isFinite(priceMin) ? Math.floor(priceMin) : 0,
      priceMax: Math.ceil(priceMax),
      hasRefundable,
      currency: offers[0]?.fare.currency ?? "INR",
    };
  }, [offers]);

  const toggle = (list: string[], value: string, set: (v: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const visible = useMemo(() => {
    const cap = maxPrice ?? facets.priceMax;
    const filtered = offers.filter((o) => {
      if (airlines.length && !airlines.includes(o.airlineCode)) return false;
      if (stops.length && !stops.includes(Math.min(o.stops, 2))) return false;
      if (cabins.length && !o.fares.some((f) => cabins.includes(f.cabinClass))) return false;
      if (fareTypes.length && !o.fares.some((f) => fareTypes.includes(f.fareType))) return false;
      if (sources.length && !o.fares.some((f) => sources.includes(f.source))) return false;
      if (refundableOnly && !o.fares.some((f) => f.refundable)) return false;
      if (bands.length) {
        const h = hourOf(o.departure);
        const band = h === null ? null : TIME_BANDS.find((b) => b.test(h));
        if (!band || !bands.includes(band.key)) return false;
      }
      if (o.fare.total !== null && o.fare.total > cap) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "cheapest")
      sorted.sort((a, b) => (a.fare.total ?? Infinity) - (b.fare.total ?? Infinity));
    else if (sort === "fastest")
      sorted.sort((a, b) => (a.durationMin ?? Infinity) - (b.durationMin ?? Infinity));
    else if (sort === "earliest")
      sorted.sort((a, b) => (hourOf(a.departure) ?? 99) - (hourOf(b.departure) ?? 99));
    else sorted.sort((a, b) => a.recommendedRank - b.recommendedRank);
    return sorted;
  }, [offers, airlines, stops, cabins, fareTypes, sources, bands, refundableOnly, maxPrice, sort, facets.priceMax]);

  if (!offers.length) return null;

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.3em] text-primary">
          {visible.length} of {offers.length} itineraries · from{" "}
          {money(facets.priceMin, facets.currency)}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["recommended", "Recommended"],
              ["cheapest", "Cheapest"],
              ["fastest", "Fastest"],
              ["earliest", "Earliest"],
            ] as [Sort, string][]
          ).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSort(key)} className={chip(sort === key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5 rounded-2xl border border-border/60 bg-card/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary">Filters</div>

          {facets.stops.length > 1 ? (
            <FilterGroup title="Stops">
              {facets.stops.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setStops(stops.includes(s) ? stops.filter((v) => v !== s) : [...stops, s])
                  }
                  className={chip(stops.includes(s))}
                >
                  {s === 0 ? "Non-stop" : s === 1 ? "1 stop" : "2+ stops"}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.airlines.length > 1 ? (
            <FilterGroup title="Airlines">
              {facets.airlines.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => toggle(airlines, a.code, setAirlines)}
                  className={chip(airlines.includes(a.code))}
                  title={`${a.name} · from ${money(a.min, facets.currency)}`}
                >
                  {a.code}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.cabins.length > 1 ? (
            <FilterGroup title="Cabin">
              {facets.cabins.map((c) => (
                <button key={c} type="button" onClick={() => toggle(cabins, c, setCabins)} className={chip(cabins.includes(c))}>
                  {c}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.fareTypes.length > 1 ? (
            <FilterGroup title="Fare family">
              {facets.fareTypes.map((f) => (
                <button key={f} type="button" onClick={() => toggle(fareTypes, f, setFareTypes)} className={chip(fareTypes.includes(f))}>
                  {f}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.sources.length > 1 ? (
            <FilterGroup title="Fare source">
              {facets.sources.map((s) => (
                <button key={s} type="button" onClick={() => toggle(sources, s, setSources)} className={chip(sources.includes(s))}>
                  {s}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.bands.length > 1 ? (
            <FilterGroup title="Departure">
              {facets.bands.map((b) => (
                <button key={b.key} type="button" onClick={() => toggle(bands, b.key, setBands)} className={chip(bands.includes(b.key))}>
                  {b.label}
                </button>
              ))}
            </FilterGroup>
          ) : null}

          {facets.hasRefundable ? (
            <FilterGroup title="Flexibility">
              <button type="button" onClick={() => setRefundableOnly((v) => !v)} className={chip(refundableOnly)}>
                Refundable only
              </button>
            </FilterGroup>
          ) : null}

          {facets.priceMax > facets.priceMin ? (
            <FilterGroup title={`Max fare · ${money(maxPrice ?? facets.priceMax, facets.currency)}`}>
              <input
                type="range"
                min={facets.priceMin}
                max={facets.priceMax}
                step={Math.max(1, Math.round((facets.priceMax - facets.priceMin) / 50))}
                value={maxPrice ?? facets.priceMax}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </FilterGroup>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setAirlines([]);
              setStops([]);
              setCabins([]);
              setFareTypes([]);
              setSources([]);
              setBands([]);
              setRefundableOnly(false);
              setMaxPrice(null);
            }}
            className="w-full rounded-full border border-border px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
          >
            Reset filters
          </button>
        </aside>

        <div className="space-y-4">
          {visible.length ? (
            visible.map((offer) => (
              <OfferCard
                key={offer.resultIndex || `${offer.recommendedRank}`}
                offer={offer}
                searchTokenId={searchTokenId}
              />
            ))
          ) : (
            <p className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
              No itineraries match these filters. Reset one or more filters to see live fares again.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OfferCard({ offer, searchTokenId }: { offer: Offer; searchTokenId: string | null }) {
  const loadBaggage = useServerFn(up17BaggageLookup);
  const loadRules = useServerFn(up17FareRuleLookup);
  const [fareIndex, setFareIndex] = useState(0);
  const [options, setOptions] = useState<Baggage[]>(offer.baggageOptions ?? []);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<{ title: string; text: string }[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fare = offer.fares[fareIndex] ?? offer.fares[0];
  const resultIndex = fare?.fareId || offer.resultIndex;
  const currency = fare?.fare.currency ?? offer.fare.currency;

  async function refreshBaggage() {
    if (!searchTokenId || !resultIndex || loading || options.length) return;
    setLoading(true);
    try {
      const res = await loadBaggage({ data: { resultIndex, searchTokenId, currency } });
      if (res.options?.length) setOptions(res.options);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRules() {
    setRulesOpen((v) => !v);
    if (rules || !searchTokenId || !resultIndex) return;
    const res = await loadRules({ data: { resultIndex, searchTokenId } });
    setRules(res.rules ?? []);
  }

  return (
    <article className="rounded-2xl border border-border/60 bg-card/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <AirlineLogo offer={offer} />
          <div>
            <div className="text-sm text-foreground">
              {offer.airline || offer.airlineCode || "Airline"}{" "}
              <span className="text-muted-foreground">{offer.flightNumbers.join(" · ")}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {offer.origin} {clock(offer.departure)} → {offer.destination} {clock(offer.arrival)} ·{" "}
              {duration(offer.durationMin)} ·{" "}
              {offer.stops === 0
                ? "Non-stop"
                : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}${
                    offer.stopAirports.length ? ` via ${offer.stopAirports.join(", ")}` : ""
                  }`}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em]">
              {fare?.cabinClass ? <Tag>{fare.cabinClass}</Tag> : null}
              {fare?.fareType ? <Tag>{fare.fareType}</Tag> : null}
              {fare?.refundable === null ? null : (
                <Tag tone={fare?.refundable ? "good" : "muted"}>
                  {fare?.refundable ? "Refundable" : "Non-refundable"}
                </Tag>
              )}
              {fare?.checkInBaggage ? <Tag>Checked {fare.checkInBaggage}</Tag> : null}
              {fare?.cabinBaggage ? <Tag>Cabin {fare.cabinBaggage}</Tag> : null}
              {fare?.seatsAvailable !== null && fare?.seatsAvailable !== undefined && fare.seatsAvailable <= 5 ? (
                <Tag tone="warn">{fare.seatsAvailable} seats left</Tag>
              ) : null}
              {fare?.source ? <Tag>{fare.source}</Tag> : null}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl">{money(fare?.fare.total ?? offer.fare.total, currency)}</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Total fare · incl. taxes
          </div>
          {fare?.fare.base !== null && fare?.fare.base !== undefined ? (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Base {money(fare.fare.base, currency)} · Taxes {money(fare.fare.tax, currency)}
            </div>
          ) : null}
        </div>
      </div>

      {offer.fares.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
          {offer.fares.map((f, i) => (
            <button
              key={f.fareId || i}
              type="button"
              onClick={() => {
                setFareIndex(i);
                setOptions([]);
                setSelected("");
                setRules(null);
              }}
              className={`rounded-xl border px-3 py-2 text-left text-[11px] transition ${
                i === fareIndex
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="uppercase tracking-[0.2em]">{f.fareType || "Fare"}</div>
              <div className="mt-0.5 text-sm text-foreground">{money(f.fare.total, f.fare.currency)}</div>
              {f.checkInBaggage ? (
                <div className="text-[10px] text-muted-foreground">Bag {f.checkInBaggage}</div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/50 pt-4">
        <label className="min-w-[240px] flex-1">
          <span className="block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Extra checked baggage
            {fare?.checkInBaggage ? ` · ${fare.checkInBaggage} included` : ""}
          </span>
          <select
            value={selected}
            onFocus={refreshBaggage}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
          >
            <option value="">Included allowance only</option>
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
                {o.price ? ` — ${money(o.price, o.currency)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="rounded-full border border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          {detailsOpen ? "Hide itinerary" : "Itinerary"}
        </button>
        <button
          type="button"
          onClick={toggleRules}
          className="rounded-full border border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          {rulesOpen ? "Hide fare rules" : "Fare rules"}
        </button>
        <button
          type="button"
          className="rounded-full bg-primary px-6 py-2.5 text-[11px] uppercase tracking-[0.25em] text-primary-foreground hover:opacity-90"
        >
          Select fare
        </button>
      </div>

      {loading ? (
        <p className="mt-2 text-[10px] text-muted-foreground">Loading airline baggage options…</p>
      ) : null}

      {detailsOpen ? (
        <ul className="mt-4 space-y-2 border-t border-border/50 pt-4">
          {offer.segments.map((s, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              <span className="text-foreground">
                {s.airlineCode}
                {s.flightNumber}
              </span>{" "}
              {s.origin}
              {s.originTerminal ? ` T${s.originTerminal}` : ""} {clock(s.departure)} →{" "}
              {s.destination}
              {s.destinationTerminal ? ` T${s.destinationTerminal}` : ""} {clock(s.arrival)} ·{" "}
              {duration(s.durationMin)}
              {s.fareClass ? ` · class ${s.fareClass}` : ""}
              {s.craft ? ` · ${s.craft}` : ""}
              {s.layoverMin ? ` · layover ${duration(s.layoverMin)}` : ""}
            </li>
          ))}
          {fare?.inclusions.length ? (
            <li className="text-xs text-muted-foreground">
              Inclusions: {fare.inclusions.join(" · ")}
            </li>
          ) : null}
          {fare?.airlineRemark ? (
            <li className="text-xs text-muted-foreground">{fare.airlineRemark}</li>
          ) : null}
        </ul>
      ) : null}

      {rulesOpen ? (
        <div className="mt-4 max-h-64 overflow-auto border-t border-border/50 pt-4 text-xs text-muted-foreground">
          {rules === null ? (
            <p>Loading fare rules…</p>
          ) : rules.length ? (
            rules.map((r, i) => (
              <div key={i} className="mb-3">
                <div className="text-foreground">{r.title}</div>
                <div dangerouslySetInnerHTML={{ __html: r.text }} />
              </div>
            ))
          ) : (
            <p>No fare rules returned for this fare.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "muted";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/50 text-emerald-500"
      : tone === "warn"
        ? "border-amber-500/50 text-amber-500"
        : tone === "muted"
          ? "border-border text-muted-foreground"
          : "border-border text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}
