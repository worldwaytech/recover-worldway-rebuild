import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { up17BaggageLookup } from "@/lib/up17/up17.functions";

type Baggage = {
  tier: number;
  code: string;
  label: string;
  weightKg: number | null;
  price: number | null;
  currency: string;
};

export type Offer = {
  recommendedRank: number;
  resultIndex: string;
  airline: string;
  airlineCode: string;
  flightNumbers: string[];
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  stops: number;
  durationMin: number | null;
  refundable: boolean | null;
  fare: { currency: string; total: number | null; base: number | null; tax: number | null };
  baggageOptions: Baggage[];
};

function money(amount: number | null, currency: string) {
  if (amount === null) return "On request";
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

export function Up17FlightResults({
  offers,
  searchTokenId,
}: {
  offers: Offer[];
  searchTokenId: string | null;
}) {
  if (!offers.length) return null;
  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <h2 className="mb-4 text-[11px] uppercase tracking-[0.3em] text-primary">
        Recommended flights · {offers.length} fares
      </h2>
      <div className="space-y-4">
        {offers.map((offer) => (
          <OfferCard key={offer.resultIndex || offer.recommendedRank} offer={offer} searchTokenId={searchTokenId} />
        ))}
      </div>
    </section>
  );
}

function OfferCard({ offer, searchTokenId }: { offer: Offer; searchTokenId: string | null }) {
  const loadBaggage = useServerFn(up17BaggageLookup);
  const [options, setOptions] = useState<Baggage[]>(offer.baggageOptions ?? []);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshBaggage() {
    if (!searchTokenId || !offer.resultIndex || loading) return;
    setLoading(true);
    try {
      const res = await loadBaggage({
        data: {
          resultIndex: offer.resultIndex,
          searchTokenId,
          currency: offer.fare.currency,
        },
      });
      if (res.options?.length) setOptions(res.options);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="rounded-2xl border border-border/60 bg-card/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 min-w-10 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
            #{offer.recommendedRank}
          </div>
          <div>
            <div className="text-sm text-foreground">
              {offer.airline || offer.airlineCode || "Airline"}{" "}
              <span className="text-muted-foreground">{offer.flightNumbers.join(" · ")}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {offer.origin} {clock(offer.departure)} → {offer.destination} {clock(offer.arrival)} ·{" "}
              {duration(offer.durationMin)} ·{" "}
              {offer.stops === 0 ? "Non-stop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}
              {offer.refundable === null ? "" : offer.refundable ? " · Refundable" : " · Non-refundable"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl">{money(offer.fare.total, offer.fare.currency)}</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Total fare
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/50 pt-4">
        <label className="flex-1 min-w-[240px]">
          <span className="block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Extra check-in baggage
          </span>
          <select
            value={selected}
            onFocus={refreshBaggage}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
          >
            <option value="">No extra baggage</option>
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {`Extra check-in baggage ${o.tier}`}
                {o.weightKg ? ` — ${o.weightKg}kg` : ""}
                {o.price ? ` — ${money(o.price, o.currency)}` : ""}
              </option>
            ))}
          </select>
        </label>
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
    </article>
  );
}
