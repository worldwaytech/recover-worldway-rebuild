import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { busSeatOptions, hotelRoomOptions, prepareBusBooking, prepareHotelBooking } from "@/lib/up17/booking.functions";
import { TravelCheckout, type TravelIntent } from "./travel-checkout";

type Person = { title: "Mr" | "Mrs" | "Ms"; first_name: string; last_name: string; email: string; phone: string };
const blank: Person = { title: "Mr", first_name: "", last_name: "", email: "", phone: "" };

function useSignedIn() {
  const [s, setS] = useState<boolean | null>(null);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setS(!!data.session)); }, []);
  return s;
}

function SignInPrompt() {
  return (
    <div className="rounded-md border border-border p-4 text-sm">
      Sign in to book. <Link to="/auth" className="text-primary underline">Sign in</Link>
    </div>
  );
}

function PersonFields({ value, onChange, id }: { value: Person; onChange: (p: Person) => void; id: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      <select aria-label="Title" className="rounded-md border border-input bg-background px-2 text-sm" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value as Person["title"] })}>
        <option>Mr</option><option>Mrs</option><option>Ms</option>
      </select>
      <Input aria-label="First name" id={`${id}-fn`} placeholder="First name" value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
      <Input aria-label="Last name" placeholder="Last name" value={value.last_name} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
      <Input aria-label="Email" type="email" placeholder="Email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
      <Input aria-label="Phone" inputMode="numeric" placeholder="Phone" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value.replace(/\D/g, "") })} />
    </div>
  );
}

// ------------------------------------------------------------------ hotel

type RoomOpt = { roomIndex: number; name: string; mealPlan: string | null; price: number | null; currency: string; cancellation: string | null };

export function HotelBookPanel(props: { resultIndex: string; hotelCode: string; hotelName: string; city: string; token: string }) {
  const signedIn = useSignedIn();
  const rooms = useServerFn(hotelRoomOptions);
  const prepare = useServerFn(prepareHotelBooking);
  const [opts, setOpts] = useState<RoomOpt[] | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [lead, setLead] = useState<Person>(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TravelIntent | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    void rooms({ data: { resultIndex: props.resultIndex, hotelCode: props.hotelCode, searchTokenId: props.token } }).then((r) => {
      setOpts(r.rooms);
      if (!r.ok) setError(r.error);
    });
  }, [signedIn, props.resultIndex, props.hotelCode, props.token, rooms]);

  if (signedIn === false) return <SignInPrompt />;
  if (intent) return <TravelCheckout intent={intent} />;

  async function hold() {
    if (choice === null) return setError("Choose a room.");
    setBusy(true);
    setError(null);
    try {
      const r = await prepare({ data: {
        resultIndex: props.resultIndex, hotelCode: props.hotelCode, hotelName: props.hotelName, searchTokenId: props.token,
        nationality: "IN", city: props.city,
        rooms: [{ roomIndex: choice, guests: [{ ...lead, pax_type: 1, age: 0, lead: true }] }],
      } });
      if (!r.ok) return setError(r.error);
      setIntent({ ...r, product: "hotel", description: props.hotelName, email: lead.email, phone: lead.phone, name: `${lead.first_name} ${lead.last_name}` });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : "Check the guest details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4 text-sm">
      {opts === null ? <p className="text-muted-foreground">Loading live rooms…</p> : opts.length === 0 ? <p>No rooms are bookable online right now.</p> : (
        <ul className="space-y-1.5">
          {opts.map((o) => (
            <li key={o.roomIndex}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-background/50 p-2">
                <input type="radio" name={`room-${props.hotelCode}`} checked={choice === o.roomIndex} onChange={() => setChoice(o.roomIndex)} />
                <span className="flex-1">{o.name}{o.mealPlan ? ` · ${o.mealPlan}` : ""}{o.cancellation ? <span className="block text-xs text-muted-foreground line-clamp-2">{o.cancellation}</span> : null}</span>
                <span className="text-primary">{o.price != null ? `${o.currency} ${o.price.toLocaleString()}` : "—"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Lead guest</div>
      <PersonFields id={`h-${props.hotelCode}`} value={lead} onChange={setLead} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button onClick={hold} disabled={busy || !opts?.length}>{busy ? "Checking live price…" : "Check price & continue"}</Button>
    </div>
  );
}

// ------------------------------------------------------------------ bus

type Seat = { seatName: string; price: number | null; currency: string; available: boolean; ladies: boolean };
type Point = { id: number; name: string; location: string; time: string | null };

export function BusBookPanel(props: { resultIndex: string; token: string; operator: string; route: string; departure: string | null }) {
  const signedIn = useSignedIn();
  const load = useServerFn(busSeatOptions);
  const prepare = useServerFn(prepareBusBooking);
  const [data, setData] = useState<{ seats: Seat[]; boarding: Point[]; dropping: Point[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [board, setBoard] = useState<number | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [pax, setPax] = useState<Record<string, Person & { gender: "1" | "2"; age: string }>>({});
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TravelIntent | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    void load({ data: { resultIndex: props.resultIndex, searchTokenId: props.token } }).then((r) => {
      setData(r);
      if (!r.ok) setError(r.error);
    });
  }, [signedIn, props.resultIndex, props.token, load]);

  if (signedIn === false) return <SignInPrompt />;
  if (intent) return <TravelCheckout intent={intent} />;

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= 6 ? p : [...p, s]));

  async function hold() {
    if (!picked.length || board === null || drop === null) return setError("Choose seats, a boarding point and a drop-off point.");
    setBusy(true);
    setError(null);
    try {
      const passengers = picked.map((seat, i) => {
        const p = pax[seat] ?? { ...blank, gender: "1" as const, age: "" };
        return { title: p.title, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, gender: p.gender, age: Number(p.age), address, seat_name: seat, lead: i === 0 };
      });
      const r = await prepare({ data: { resultIndex: props.resultIndex, searchTokenId: props.token, boardingPointId: board, droppingPointId: drop, operator: props.operator, route: props.route, departure: props.departure ?? undefined, passengers } });
      if (!r.ok) return setError(r.error);
      const lead = passengers[0];
      setIntent({ ...r, product: "bus", description: props.route, email: lead.email, phone: lead.phone, name: `${lead.first_name} ${lead.last_name}` });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : "Check the passenger details.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading live seats…</p>;
  return (
    <div className="space-y-3 rounded-md border border-border p-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {data.seats.map((s) => (
          <button key={s.seatName} type="button" disabled={!s.available} onClick={() => toggle(s.seatName)}
            className={`min-w-10 rounded border px-2 py-1 text-xs ${picked.includes(s.seatName) ? "border-primary bg-primary text-primary-foreground" : s.available ? "border-border" : "border-border opacity-30"}`}
            title={s.price != null ? `${s.currency} ${s.price}${s.ladies ? " · ladies" : ""}` : undefined}>
            {s.seatName}
          </button>
        ))}
        {data.seats.length === 0 ? <p>No seats are bookable online right now.</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Boarding point" className="rounded-md border border-input bg-background p-2" value={board ?? ""} onChange={(e) => setBoard(Number(e.target.value))}>
          <option value="">Boarding point</option>
          {data.boarding.map((p) => <option key={p.id} value={p.id}>{p.name}{p.time ? ` · ${p.time}` : ""}</option>)}
        </select>
        <select aria-label="Drop-off point" className="rounded-md border border-input bg-background p-2" value={drop ?? ""} onChange={(e) => setDrop(Number(e.target.value))}>
          <option value="">Drop-off point</option>
          {data.dropping.map((p) => <option key={p.id} value={p.id}>{p.name}{p.time ? ` · ${p.time}` : ""}</option>)}
        </select>
      </div>
      {picked.map((seat, i) => {
        const p = pax[seat] ?? { ...blank, gender: "1" as const, age: "" };
        const set = (v: typeof p) => setPax((m) => ({ ...m, [seat]: v }));
        return (
          <div key={seat} className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Seat {seat}{i === 0 ? " · lead passenger" : ""}</div>
            <PersonFields id={`b-${seat}`} value={p} onChange={(v) => set({ ...p, ...v })} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Gender" className="rounded-md border border-input bg-background p-2" value={p.gender} onChange={(e) => set({ ...p, gender: e.target.value as "1" | "2" })}>
                <option value="1">Male</option><option value="2">Female</option>
              </select>
              <Input aria-label="Age" inputMode="numeric" placeholder="Age" value={p.age} onChange={(e) => set({ ...p, age: e.target.value.replace(/\D/g, "") })} />
            </div>
          </div>
        );
      })}
      <Input aria-label="Address" placeholder="Lead passenger address" value={address} onChange={(e) => setAddress(e.target.value)} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button onClick={hold} disabled={busy || !picked.length}>{busy ? "Holding seats…" : "Hold seats & continue"}</Button>
    </div>
  );
}
