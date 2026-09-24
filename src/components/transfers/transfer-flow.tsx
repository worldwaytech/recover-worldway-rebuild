import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { SearchCard, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { bookTransfer, searchTransferAvailability, searchTransferPoints } from "@/lib/hbx/transfers.functions";
import type { TransferAvailability, TransferOption } from "@/lib/hbx/transfer-model";
import { portal } from "@/lib/portal-store";

type Point = { type: string; code: string; name: string; city?: string | null; country?: string | null };

const TYPE_LABEL: Record<string, string> = { ATLAS: "Hotel", IATA: "Airport", PORT: "Port", STATION: "Train station", GIATA: "Hotel", GPS: "Coordinates" };

function PointPicker({ label, value, onChange }: { label: string; value: Point | null; onChange: (p: Point | null) => void }) {
  const search = useServerFn(searchTransferPoints);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Point[]>([]);
  const [open, setOpen] = useState(false);
  const [gps, setGps] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gps || q.trim().length < 2 || (value && q === value.name)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setItems(await search({ data: { q } }));
        setOpen(true);
      } catch {
        setItems([]);
      }
    }, 250);
  }, [q, gps, value, search]);

  return (
    <Field label={label}>
      <div className="relative">
        <input
          className={inputClass}
          value={q}
          placeholder={gps ? "Latitude,Longitude e.g. 41.3851,2.1734" : "Hotel, airport, port or station"}
          onChange={(e) => {
            setQ(e.target.value);
            if (gps) {
              const v = e.target.value.replace(/\s/g, "");
              onChange(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(v) ? { type: "GPS", code: v, name: v } : null);
            } else onChange(null);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && !gps && items.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow-lg">
            {items.map((p) => (
              <li key={`${p.type}-${p.code}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={() => {
                    onChange(p);
                    setQ(p.name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {TYPE_LABEL[p.type] ?? p.type} · {p.code}
                    {p.city ? ` · ${p.city}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => { setGps(!gps); setQ(""); onChange(null); }}>
          {gps ? "Search by name instead" : "Use exact GPS coordinates"}
        </button>
      </div>
    </Field>
  );
}

function money(v: number, c: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: c || "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} ${c}`;
  }
}

function policyText(o: TransferOption) {
  if (!o.cancellationPolicies.length) return "Free cancellation not stated";
  return o.cancellationPolicies
    .map((p) => `From ${p.from.replace("T", " ")} local time (UTC${p.utcOffset ?? ""}) a charge of ${money(p.amount, p.currency)} applies`)
    .join("; ");
}

function OptionCard({ o, selected, onSelect }: { o: TransferOption; selected: boolean; onSelect: () => void }) {
  const img = o.images.find((i) => i.type === "MEDIUM") ?? o.images[0];
  const [more, setMore] = useState(false);
  return (
    <div className={`rounded-xl border p-4 ${selected ? "border-primary ring-1 ring-primary" : "border-border/60"} bg-card`}>
      <div className="flex gap-4">
        {img ? <img src={img.url} alt={`${o.vehicle.name} vehicle`} className="h-24 w-32 rounded-md object-cover" loading="lazy" /> : null}
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">{o.transferType === "PRIVATE" ? "Private" : o.transferType === "SHARED" ? "Shared" : o.transferType}</span>
            <span>{o.vehicle.name}</span>
            <span>· {o.category.name}</span>
          </div>
          <div className="text-sm">
            {o.pickup.fromName} → {o.pickup.toName}
          </div>
          <div className="text-xs text-muted-foreground">
            {o.details.map((d) => `${d.value ?? ""} ${d.description}`.trim()).join(" · ")}
          </div>
          {o.pickup.time ? <div className="text-xs">Pickup: {o.pickup.date} {o.pickup.time.slice(0, 5)}</div> : null}
          {o.pickup.checkPickup?.mustCheckPickupTime ? (
            <div className="text-xs text-primary">
              Pickup time must be confirmed at {o.pickup.checkPickup.url} {o.pickup.checkPickup.hoursBeforeConsulting ?? ""} hours before travel.
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">{policyText(o)}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{money(o.price.total, o.price.currency)}</div>
          <div className="text-xs text-muted-foreground">{o.price.currency} · total</div>
          <button type="button" onClick={onSelect} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs uppercase tracking-widest text-primary-foreground">
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </div>
      <button type="button" className="mt-2 text-xs underline" onClick={() => setMore(!more)}>
        {more ? "Hide" : "Show"} pickup information, remarks and extras
      </button>
      {more && (
        <div className="mt-2 space-y-2 text-xs">
          {o.pickup.description ? <p className="whitespace-pre-line"><strong>Pickup information:</strong> {o.pickup.description}</p> : null}
          {o.remarks.map((r, i) => (
            <p key={i} className="whitespace-pre-line"><strong>Remarks{r.mandatory ? " (mandatory)" : ""}:</strong> {r.description}</p>
          ))}
          {o.supplierTimes.filter((t) => t.remarks).map((t, i) => <p key={i}>{t.remarks}</p>)}
          {o.extras.length ? (
            <p><strong>Optional extras:</strong> {o.extras.map((e) => `${e.name} (${money(e.amount, o.price.currency)})`).join(", ")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function transportFor(p: Point | null): "FLIGHT" | "TRAIN" | "CRUISE" {
  if (p?.type === "STATION") return "TRAIN";
  if (p?.type === "PORT") return "CRUISE";
  return "FLIGHT";
}

export function TransferFlow() {
  const avail = useServerFn(searchTransferAvailability);
  const book = useServerFn(bookTransfer);
  const navigate = useNavigate();
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [round, setRound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransferAvailability | null>(null);
  const [selOut, setSelOut] = useState<TransferOption | null>(null);
  const [selIn, setSelIn] = useState<TransferOption | null>(null);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [booking, setBooking] = useState(false);
  const [idem] = useState(() => crypto.randomUUID());

  async function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!from || !to) return setError("Choose both a pickup and a drop-off point.");
    setLoading(true);
    setError(null);
    setResult(null);
    setSelOut(null);
    setSelIn(null);
    try {
      const res = await avail({
        data: {
          from: { type: from.type as never, code: from.code },
          to: { type: to.type as never, code: to.code },
          outbound: String(f.get("outbound")),
          inbound: round ? String(f.get("inbound") || "") || null : null,
          adults: Number(f.get("adults") || 1),
          children: Number(f.get("children") || 0),
          infants: Number(f.get("infants") || 0),
        },
      });
      if (!res.ok || !res.data) setError(res.error ?? "No transfers found.");
      else setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onBook(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!portal.session()) return navigate({ to: "/auth" });
    const f = new FormData(e.currentTarget);
    const legs = [selOut, selIn].filter(Boolean).map((o, i) => {
      const opt = o as TransferOption;
      const pickupPoint = i === 0 ? from : to;
      const dropPoint = i === 0 ? to : from;
      const terminal = [pickupPoint, dropPoint].find((p) => p && p.type !== "ATLAS" && p.type !== "GPS" && p.type !== "GIATA") ?? null;
      return {
        rateKey: opt.rateKey,
        direction: (opt.direction === "ARRIVAL" ? "ARRIVAL" : "DEPARTURE") as "ARRIVAL" | "DEPARTURE",
        transportType: transportFor(terminal),
        transportCode: String(f.get(`transport_${i}`) || ""),
        companyName: String(f.get(`company_${i}`) || "") || null,
        extras: opt.extras.filter((x) => (extras[`${i}:${x.code}`] ?? 0) > 0).map((x) => ({ code: x.code, units: extras[`${i}:${x.code}`]! })),
        gps:
          pickupPoint?.type === "GPS" || dropPoint?.type === "GPS"
            ? { pickupAddress: String(f.get(`gps_pickup_${i}`) || "") || null, dropoffAddress: String(f.get(`gps_drop_${i}`) || "") || null }
            : null,
      };
    });
    setBooking(true);
    setError(null);
    try {
      const res = await book({
        data: {
          idempotencyKey: idem,
          title: `Transfer ${from?.name ?? ""} → ${to?.name ?? ""}`,
          travelDate: selOut?.pickup.date ?? result?.search.departure?.date ?? null,
          holder: {
            name: String(f.get("name")),
            surname: String(f.get("surname")),
            email: String(f.get("email")),
            phone: String(f.get("phone")),
          },
          legs,
          remark: String(f.get("remark") || "") || null,
        },
      });
      if (res.ok && res.bookingId) navigate({ to: "/transfers/voucher/$reference", params: { reference: res.worldwayReference } });
      else setError(res.message ?? "Booking failed. Please try again.");
    } catch (err) {
      setError(err instanceof Error && /unauth/i.test(err.message) ? "Please sign in to book." : "Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  const needsIn = round && (result?.inbound.length ?? 0) > 0;
  const ready = selOut && (!needsIn || selIn);
  const hasGps = from?.type === "GPS" || to?.type === "GPS";

  return (
    <>
      <SearchCard title="Transfer Search">
        <form onSubmit={onSearch} className="space-y-5">
          <div className="flex gap-4 text-xs uppercase tracking-widest">
            <label className="flex items-center gap-2"><input type="radio" checked={!round} onChange={() => setRound(false)} /> One way</label>
            <label className="flex items-center gap-2"><input type="radio" checked={round} onChange={() => setRound(true)} /> Round trip</label>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <PointPicker label="Pickup" value={from} onChange={setFrom} />
            <PointPicker label="Drop-off" value={to} onChange={setTo} />
            <Field label="Outbound date & time"><input type="datetime-local" name="outbound" required className={inputClass} /></Field>
            {round ? <Field label="Return date & time"><input type="datetime-local" name="inbound" required className={inputClass} /></Field> : <div />}
            <Field label="Adults"><input type="number" name="adults" min={1} max={20} defaultValue={2} className={inputClass} /></Field>
            <Field label="Children (2–12)"><input type="number" name="children" min={0} max={10} defaultValue={0} className={inputClass} /></Field>
            <Field label="Infants (0–2)"><input type="number" name="infants" min={0} max={10} defaultValue={0} className={inputClass} /></Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-60">
              {loading ? "Searching…" : "Search transfers"}
            </button>
          </div>
        </form>
      </SearchCard>

      <section className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {error ? <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{error}</div> : null}
        {result && (
          <>
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary">Outbound — {result.outbound.length} options</h2>
            <div className="space-y-3">
              {result.outbound.map((o) => <OptionCard key={o.rateKey} o={o} selected={selOut?.rateKey === o.rateKey} onSelect={() => setSelOut(o)} />)}
            </div>
            {result.inbound.length > 0 && (
              <>
                <h2 className="text-xs uppercase tracking-[0.3em] text-primary">Return — {result.inbound.length} options</h2>
                <div className="space-y-3">
                  {result.inbound.map((o) => <OptionCard key={o.rateKey} o={o} selected={selIn?.rateKey === o.rateKey} onSelect={() => setSelIn(o)} />)}
                </div>
              </>
            )}
          </>
        )}

        {ready && (
          <form onSubmit={onBook} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary">Lead passenger & travel details</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="First name"><input name="name" required maxLength={50} className={inputClass} /></Field>
              <Field label="Last name"><input name="surname" required maxLength={50} className={inputClass} /></Field>
              <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
              <Field label="Mobile (international)"><input name="phone" required pattern="\+?[0-9 ()-]{6,20}" placeholder="+34…" className={inputClass} /></Field>
            </div>
            {[selOut, selIn].filter(Boolean).map((o, i) => {
              const opt = o as TransferOption;
              const t = transportFor([i === 0 ? from : to, i === 0 ? to : from].find((p) => p && !["ATLAS", "GPS", "GIATA"].includes(p.type)) ?? null);
              const lbl = t === "TRAIN" ? "Train number" : t === "CRUISE" ? "Vessel / ship name" : "Flight number";
              return (
                <div key={i} className="space-y-3 rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{i === 0 ? "Outbound" : "Return"}: {opt.pickup.fromName} → {opt.pickup.toName}</div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label={lbl}><input name={`transport_${i}`} required minLength={1} maxLength={t === "CRUISE" ? 40 : 7} className={inputClass} /></Field>
                    <Field label={t === "FLIGHT" ? "Airline (optional)" : t === "TRAIN" ? "Rail company (optional)" : "Cruise line (optional)"}><input name={`company_${i}`} maxLength={60} className={inputClass} /></Field>
                  </div>
                  {hasGps ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Exact pickup address"><input name={`gps_pickup_${i}`} required={from?.type === "GPS" || to?.type === "GPS"} maxLength={200} className={inputClass} /></Field>
                      <Field label="Exact drop-off address"><input name={`gps_drop_${i}`} maxLength={200} className={inputClass} /></Field>
                    </div>
                  ) : null}
                  {opt.extras.length > 0 && (
                    <div className="grid gap-2 md:grid-cols-3">
                      {opt.extras.map((x) => (
                        <label key={x.code} className="flex items-center justify-between gap-2 text-sm">
                          <span>{x.name} <span className="text-xs text-muted-foreground">{money(x.amount, opt.price.currency)}</span></span>
                          <input type="number" min={0} max={20} value={extras[`${i}:${x.code}`] ?? 0} onChange={(e) => setExtras({ ...extras, [`${i}:${x.code}`]: Number(e.target.value) })} className={`${inputClass} w-20`} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Field label="Remarks for the driver (optional)"><textarea name="remark" maxLength={500} className={inputClass} rows={2} /></Field>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                Total: <strong>{money((selOut?.price.total ?? 0) + (selIn?.price.total ?? 0), selOut?.price.currency ?? "EUR")}</strong>
                <span className="ml-1 text-xs text-muted-foreground">+ selected extras</span>
              </div>
              <button type="submit" disabled={booking} className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-60">
                {booking ? "Confirming…" : "Confirm booking"}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
