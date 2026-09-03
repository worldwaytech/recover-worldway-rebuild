import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portal, type PortalUser } from "@/lib/portal-store";
import type {
  CabLocation,
  CabPlace,
  CabQuote,
  CabQuoteGroup,
  CabQuoteResponseData,
} from "@/lib/tripjack/cabs-contract";
import type { CabJourneyType, CabTripType } from "@/lib/tripjack/config";
import {
  createCabBooking,
  getCabQuotes,
  payCabBookingFn,
  resolveCabLocation,
  searchCabLocations,
} from "@/lib/tripjack/tripjack.functions";

const JOURNEYS: Array<{ journeyType: CabJourneyType; tripType: CabTripType; label: string }> = [
  { journeyType: "airport_transfer", tripType: "oneway", label: "Airport transfer" },
  { journeyType: "outstation", tripType: "oneway", label: "Outstation one-way" },
  { journeyType: "outstation", tripType: "roundtrip", label: "Round trip" },
  { journeyType: "local", tripType: "oneway", label: "Local hire" },
];

function toSupplierDateTime(value: string): string {
  // <input type="datetime-local"> → "yyyy-MM-dd HH:mm" (Cabs v2 §3.1)
  return value.replace("T", " ").slice(0, 16);
}

function defaultPickup(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LocationPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CabLocation | null;
  onChange: (loc: CabLocation | null) => void;
}) {
  const search = useServerFn(searchCabLocations);
  const resolve = useServerFn(resolveCabLocation);
  const [q, setQ] = useState(value?.displayAddress ?? "");
  const [options, setOptions] = useState<CabPlace[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 3 || (value && q === value.displayAddress)) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await search({ data: { query: q.trim() } });
      setBusy(false);
      setOptions(r.ok ? r.data.slice(0, 6) : []);
    }, 350);
    return () => clearTimeout(t);
  }, [q, search, value]);

  const pick = async (p: CabPlace) => {
    setOptions([]);
    setQ(p.displayLabel);
    const r = await resolve({ data: { placeId: p.id } });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    onChange({
      type: "location",
      displayAddress: p.displayLabel,
      lat: String(r.data.location.lat),
      long: String(r.data.location.lng),
      address: {
        city: r.data.address?.city,
        country: r.data.address?.country,
        postalCode: r.data.address?.postalCode,
      },
    });
  };

  return (
    <div className="relative">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input
        value={q}
        placeholder="Start typing an address, airport or landmark"
        onChange={(e) => {
          setQ(e.target.value);
          onChange(null);
        }}
        className="mt-2"
        aria-label={label}
      />
      {busy && <p className="mt-1 text-xs text-muted-foreground">Searching…</p>}
      {options.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => pick(o)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {o.displayLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CabBooking({ enabled }: { enabled: boolean }) {
  const nav = useNavigate();
  const quote = useServerFn(getCabQuotes);
  const book = useServerFn(createCabBooking);
  const pay = useServerFn(payCabBookingFn);

  const [me, setMe] = useState<PortalUser | null>(null);
  useEffect(() => {
    setMe(portal.session());
    return portal.subscribe(() => setMe(portal.session()));
  }, []);

  const [journey, setJourney] = useState(0);
  const [origin, setOrigin] = useState<CabLocation | null>(null);
  const [destination, setDestination] = useState<CabLocation | null>(null);
  const [pickup, setPickup] = useState(defaultPickup);
  const [ret, setRet] = useState("");
  const [pax, setPax] = useState(2);
  const [result, setResult] = useState<CabQuoteResponseData | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ group: CabQuoteGroup; quote: CabQuote } | null>(null);
  const [pax1, setPax1] = useState({ firstName: "", lastName: "", email: "", phone: "", flight: "" });
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<{ id: string; reference: string; status: string; paymentStatus?: string; trackingLink?: string } | null>(null);
  const idem = useMemo(() => crypto.randomUUID(), [selected]);

  const j = JOURNEYS[journey]!;

  const runSearch = async () => {
    if (!origin || !destination) return toast.error("Choose a pickup and drop-off location from the suggestions.");
    if (j.tripType === "roundtrip" && !ret) return toast.error("Select a return date and time.");
    setSearching(true);
    setResult(null);
    setSelected(null);
    setDone(null);
    const r = await quote({
      data: {
        origin,
        destination,
        journeyType: j.journeyType,
        tripType: j.tripType,
        pickupDate: toSupplierDateTime(pickup),
        returnDate: j.tripType === "roundtrip" ? toSupplierDateTime(ret) : undefined,
        passengers: pax,
      },
    });
    setSearching(false);
    if (!r.ok) return toast.error(r.message);
    setResult(r.data);
    if (!r.data.quotesInfo?.length) toast.message("No vehicles are available for this journey.");
  };

  const runBook = async () => {
    if (!me) return nav({ to: "/auth" });
    if (!selected || !result) return;
    if (!pax1.firstName || !pax1.lastName || !pax1.email || !pax1.phone) {
      return toast.error("Lead passenger name, email and phone are required.");
    }
    const q = selected.quote;
    const gross = q.fareBreakup?.totalFare ?? 0;
    setBooking(true);
    try {
      const r = await book({
        data: {
          idempotencyKey: idem,
          title: `${j.label}: ${origin?.address.city ?? origin?.displayAddress} → ${destination?.address.city ?? destination?.displayAddress}`,
          request: {
            journeyInfo: result.journeyInfo ?? {},
            routeDetail: result.routeDetails ?? {},
            quotationInfo: {
              vehicleType: selected.group.vehicleType,
              vehicleCategory: selected.group.vehicleCategory,
              quoteId: q.quotationId,
              childQuoteId: q.quoteChildId,
              paxCount: q.paxCount ?? pax,
              luggageCount: q.luggageCount ?? 0,
              vendorId: q.vendorId,
            },
            pricingInfo: {
              netAmount: String(gross),
              addonsPrice: "0",
              agentMarkup: 0,
              agentMarkupSplitup: { onwardJourneyMarkup: 0, returnJourneyMarkup: 0 },
              grossAmount: String(gross),
            },
            passengerDetail: {
              firstName: pax1.firstName,
              lastName: pax1.lastName,
              email: pax1.email,
              phone: pax1.phone,
              flightDetails: pax1.flight ? { number: pax1.flight } : undefined,
            },
          },
        },
      });
      setDone({
        id: r.booking.id,
        reference: r.booking.reference,
        status: r.booking.status,
        paymentStatus: r.booking.paymentStatus,
        trackingLink: r.booking.trackingLink,
      });
      r.booking.status === "failed" ? toast.error(r.message) : toast.success(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed.");
    } finally {
      setBooking(false);
    }
  };

  const runPay = async () => {
    if (!done) return;
    setBooking(true);
    try {
      const r = await pay({ data: { bookingId: done.id } });
      setDone({ ...done, status: r.booking.status, paymentStatus: r.booking.paymentStatus, trackingLink: r.booking.trackingLink });
      toast.message(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setBooking(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {JOURNEYS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setJourney(i)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                i === journey ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <LocationPicker label="Pickup" value={origin} onChange={setOrigin} />
          <LocationPicker label="Drop-off" value={destination} onChange={setDestination} />
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Pickup date &amp; time</Label>
            <Input type="datetime-local" className="mt-2" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </div>
          {j.tripType === "roundtrip" ? (
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Return date &amp; time</Label>
              <Input type="datetime-local" className="mt-2" value={ret} onChange={(e) => setRet(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Passengers</Label>
              <Input type="number" min={1} max={12} className="mt-2" value={pax} onChange={(e) => setPax(Number(e.target.value) || 1)} />
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={runSearch} disabled={!enabled || searching}>
            {searching ? "Fetching live quotes…" : "Get live quotes"}
          </Button>
          {!enabled && (
            <p className="text-sm text-muted-foreground">Live quoting is unavailable until the supplier channel is configured.</p>
          )}
        </div>
      </div>

      {result?.quotesInfo && result.quotesInfo.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="font-display text-2xl">Available vehicles</h2>
          {result.quotesInfo.map((g, gi) =>
            (g.quotes ?? []).map((q, qi) => {
              const active = selected?.quote === q;
              return (
                <article
                  key={`${gi}-${qi}`}
                  className={`flex flex-col gap-4 rounded-xl border p-5 md:flex-row md:items-center ${
                    active ? "border-primary" : "border-border"
                  }`}
                >
                  {g.vehicleImages?.[0] && (
                    <img src={g.vehicleImages[0]} alt={g.label ?? g.vehicleType ?? "Vehicle"} loading="lazy" className="h-20 w-32 rounded-md object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-medium">{g.label ?? g.vehicleType}</h3>
                    <p className="text-sm text-muted-foreground">
                      {g.vehicleCategory} · {g.paxCapacity ?? q.paxCount} seats · {g.luggageCapacity ?? q.luggageCount} bags
                      {q.model ? ` · ${q.model}` : ""}
                    </p>
                    {q.policies?.inclusions && q.policies.inclusions.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">Includes: {q.policies.inclusions.slice(0, 3).join(", ")}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold">₹{(q.fareBreakup?.totalFare ?? 0).toLocaleString("en-IN")}</p>
                    <Button size="sm" variant={active ? "default" : "outline"} className="mt-2" onClick={() => setSelected({ group: g, quote: q })}>
                      {active ? "Selected" : "Select"}
                    </Button>
                  </div>
                </article>
              );
            }),
          )}
        </div>
      )}

      {selected && !done && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl">Lead passenger</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input placeholder="First name" value={pax1.firstName} onChange={(e) => setPax1({ ...pax1, firstName: e.target.value })} />
            <Input placeholder="Last name" value={pax1.lastName} onChange={(e) => setPax1({ ...pax1, lastName: e.target.value })} />
            <Input type="email" placeholder="Email" value={pax1.email} onChange={(e) => setPax1({ ...pax1, email: e.target.value })} />
            <Input placeholder="Mobile number" value={pax1.phone} onChange={(e) => setPax1({ ...pax1, phone: e.target.value })} />
            {j.journeyType === "airport_transfer" && (
              <Input placeholder="Flight number (optional)" value={pax1.flight} onChange={(e) => setPax1({ ...pax1, flight: e.target.value })} />
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button onClick={runBook} disabled={booking}>
              {booking ? "Booking…" : me ? "Confirm booking" : "Sign in to book"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Total ₹{(selected.quote.fareBreakup?.totalFare ?? 0).toLocaleString("en-IN")} · booked through the supplier UAT channel.
            </p>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-8 rounded-2xl border border-primary/40 bg-card p-6">
          <h2 className="font-display text-2xl">Booking {done.reference}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: <span className="font-medium text-foreground">{done.status}</span>
            {done.paymentStatus ? ` · Payment: ${done.paymentStatus}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {done.status !== "failed" && done.status !== "confirmed" && (
              <Button onClick={runPay} disabled={booking}>{booking ? "Processing…" : "Complete payment"}</Button>
            )}
            {done.trackingLink && (
              <Button asChild variant="outline"><a href={done.trackingLink} target="_blank" rel="noreferrer">Track ride</a></Button>
            )}
            <Button variant="ghost" onClick={() => nav({ to: "/account/trips" })}>View in my trips</Button>
          </div>
        </div>
      )}
    </section>
  );
}
