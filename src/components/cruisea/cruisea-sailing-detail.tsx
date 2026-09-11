import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/search-shell";
import {
  formatCruiseaDate,
  formatCruiseaMoney,
  type CruiseaAvailability,
  type CruiseaCabin,
  type CruiseaSailingDetail,
} from "@/lib/cruisea/types";
import {
  createCruiseaBookingFn,
  revalidateCruiseaCabinFn,
} from "@/lib/cruisea/cruisea.functions";
import { useCruiseaSession } from "./use-cruisea-session";

type Passenger = { firstName: string; lastName: string; dateOfBirth: string };

export function CruiseaSailingDetailView({
  sailing,
  initialGuests,
}: {
  sailing: CruiseaSailingDetail;
  initialGuests: number;
}) {
  const session = useCruiseaSession();
  const navigate = useNavigate();
  const revalidate = useServerFn(revalidateCruiseaCabinFn);
  const createBooking = useServerFn(createCruiseaBookingFn);

  const [guests, setGuests] = useState(initialGuests);
  const [cabinId, setCabinId] = useState<string | null>(sailing.cabins[0]?.id ?? null);
  const [availability, setAvailability] = useState<CruiseaAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [passengers, setPassengers] = useState<Passenger[]>([
    { firstName: "", lastName: "", dateOfBirth: "" },
  ]);

  // Prefill the lead guest from the signed-in account so holding never fails on
  // details we already hold; the guest can still edit either field.
  useEffect(() => {
    if (!session.signedIn) return;
    if (session.name) setContactName((prev) => (prev.trim() ? prev : session.name ?? ""));
    if (session.email) setContactEmail((prev) => (prev.trim() ? prev : session.email ?? ""));
  }, [session.signedIn, session.name, session.email]);

  const cabin = sailing.cabins.find((c) => c.id === cabinId) ?? null;


  function selectCabin(next: CruiseaCabin) {
    setCabinId(next.id);
    setAvailability(null);
  }

  async function onRevalidate() {
    if (!cabin) return;
    setChecking(true);
    try {
      const result = (await revalidate({
        data: { sailingId: sailing.id, cabinId: cabin.id, guests },
      })) as CruiseaAvailability;
      setAvailability(result);
      if (result.available) {
        toast.success("Live availability confirmed — price reconfirmed with the cruise line.");
      } else {
        toast.error(result.reason ?? "This cabin grade is no longer available.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Availability check failed.");
    } finally {
      setChecking(false);
    }
  }

  async function onHold() {
    if (!cabin) return;
    if (!session.signedIn) {
      toast.info("Sign in to hold this cabin.");
      return;
    }
    if (!contactName.trim() || !contactEmail.trim()) {
      toast.error("Add a lead guest name and email to hold this cabin.");
      return;
    }
    setHolding(true);
    try {
      const filled = passengers.filter((p) => p.firstName.trim() && p.lastName.trim());
      const booking = (await createBooking({
        data: {
          sailingId: sailing.id,
          cabinId: cabin.id,
          guests,
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(filled.length
            ? {
                passengers: filled.map((p) => ({
                  firstName: p.firstName.trim(),
                  lastName: p.lastName.trim(),
                  ...(p.dateOfBirth ? { dateOfBirth: p.dateOfBirth } : {}),
                })),
              }
            : {}),
        },
      })) as { id: string };
      toast.success("Cabin held. Review and confirm your voyage.");
      navigate({ to: "/voyages/cruisea/booking/$id", params: { id: booking.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not hold that cabin.");
    } finally {
      setHolding(false);
    }
  }

  const totalPrice = availability?.totalPrice ?? (cabin ? cabin.pricePerGuest * guests : 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{sailing.cruiseType}</Badge>
        <span className="text-xs uppercase tracking-[0.25em] text-primary">
          {sailing.cruiseLine} · {sailing.shipName}
        </span>
      </div>
      <h1 className="mt-4 font-serif text-4xl text-foreground md:text-5xl">{sailing.title}</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">{sailing.description}</p>

      <dl className="mt-8 grid gap-4 rounded-2xl border border-border/60 bg-card/50 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Departs" value={formatCruiseaDate(sailing.departureDate)} />
        <Detail label="Duration" value={`${sailing.durationNights} nights`} />
        <Detail label="Embarkation" value={sailing.embarkationPort} />
        <Detail label="Disembarkation" value={sailing.disembarkationPort} />
        <Detail label="Region" value={sailing.region} />
        <Detail label="Country" value={sailing.country} />
        <Detail label="Cruise areas" value={sailing.areaTags.join(", ") || "—"} />
        <Detail label="Packages" value={sailing.packageOptions.join(", ") || "Cruise only"} />
      </dl>

      {sailing.highlights.length ? (
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-foreground">Voyage highlights</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {sailing.highlights.map((h) => (
              <li
                key={h}
                className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm text-muted-foreground"
              >
                {h}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12" id="cabins">
        <h2 className="font-serif text-2xl text-foreground">Cabins & suites</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a grade, then reconfirm live availability and pricing before holding.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {sailing.cabins.map((c) => {
            const active = c.id === cabinId;
            const soldOut = c.availableInventory <= 0;
            return (
              <button
                key={c.id}
                type="button"
                disabled={soldOut}
                onClick={() => selectCabin(c)}
                className={`rounded-2xl border p-5 text-left transition disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-card/50 hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.25em] text-primary">
                    {c.category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {soldOut ? "Sold out" : `${c.availableInventory} available`}
                  </span>
                </div>
                <div className="mt-2 text-lg text-foreground">{c.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatCruiseaMoney(c.pricePerGuest)} per guest
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-border/60 bg-card/60 p-6" id="book">
        <h2 className="font-serif text-2xl text-foreground">Hold & book</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Field label="Guests">
            <select
              className="h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
              value={String(guests)}
              onChange={(e) => {
                setGuests(Number(e.target.value));
                setAvailability(null);
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Selected cabin">
            <div className="flex h-10 items-center rounded-md border border-border/60 bg-background/60 px-3 text-sm text-muted-foreground">
              {cabin ? `${cabin.category} · ${cabin.label}` : "Select a cabin grade"}
            </div>
          </Field>
          <Field label="Total">
            <div className="flex h-10 items-center rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground">
              {totalPrice ? formatCruiseaMoney(totalPrice) : "—"}
            </div>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onRevalidate} disabled={!cabin || checking}>
            {checking ? "Checking live availability…" : "Check live availability"}
          </Button>
          {availability ? (
            <span
              className={`text-xs ${availability.available ? "text-primary" : "text-destructive"}`}
            >
              {availability.available
                ? `Reconfirmed ${formatCruiseaMoney(availability.pricePerGuest)} per guest · ${availability.remainingInventory} left`
                : availability.reason}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Field label="Lead guest name">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </Field>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Guest names
          </div>
          <div className="space-y-3">
            {passengers.map((p, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="First name"
                  value={p.firstName}
                  onChange={(e) =>
                    setPassengers((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, firstName: e.target.value } : row,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Last name"
                  value={p.lastName}
                  onChange={(e) =>
                    setPassengers((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, lastName: e.target.value } : row,
                      ),
                    )
                  }
                />
                <Input
                  type="date"
                  value={p.dateOfBirth}
                  onChange={(e) =>
                    setPassengers((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, dateOfBirth: e.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3"
            disabled={passengers.length >= guests || passengers.length >= 8}
            onClick={() =>
              setPassengers((prev) => [...prev, { firstName: "", lastName: "", dateOfBirth: "" }])
            }
          >
            Add guest
          </Button>
        </div>

        <div className="mt-6">
          <Field label="Notes for the cruise desk (optional)">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {session.signedIn ? (
            <Button onClick={onHold} disabled={!cabin || holding}>
              {holding ? "Holding cabin…" : "Hold this cabin"}
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign in to hold this cabin</Link>
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link to="/voyages/cruisea/bookings">Manage my Cruisea bookings</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Holds are kept for 48 hours. Prices are reconfirmed against live inventory at the moment
          you hold, and again before you confirm.
        </p>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
