import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/search-shell";
import {
  getTourDossier,
  getTourDeparture,
  reserveTourDeparture,
  checkTourAvailability,
  getRelatedTours,
} from "@/lib/tours.functions";

import { money, TourCard, type TourCardData } from "@/components/tours/tour-card";
import { Field, inputClass } from "@/components/search-form";
import { recordTourView, useSavedTours } from "@/lib/tour-shortlist";

export const Route = createFileRoute("/tours/journey/$id")({
  head: () => ({
    meta: [
      { title: "Guided Journey — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Full day-by-day itinerary, live departure pricing and availability for this multi-day guided journey.",
      },
      { property: "og:title", content: "Guided Journey — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Day-by-day itinerary with live pricing, availability and booking.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TourDetailPage,
});

type Day = {
  day: number;
  title: string;
  summary: string;
  location: string | null;
  accommodation: string | null;
  meals: string[];
};
type Room = {
  code: string;
  name: string;
  status: string;
  price: number | null;
  deposit?: number | null;
  spaces?: number | null;
  currency: string;
};
type Departure = {
  id: string;
  startDate: string;
  finishDate: string;
  days: number | null;
  status: string;
  availableSpaces: number | null;
  price: number | null;
  currency: string;
  rooms: Room[];
};
type Availability = {
  ok: boolean;
  bookable: boolean;
  reason?: string;
  departure?: Departure;
  room?: Room | null;
  totalPrice?: number | null;
  depositDue?: number | null;
};

type Detail = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  map: string | null;
  region: string | null;
  countries: string[];
  startCity: string | null;
  finishCity: string | null;
  categories: string[];
  fromPrice: number | null;
  currency: string;
  highlights: string | null;
  included: string | null;
  details: { label: string; body: string }[];
  itinerary: Day[];
  durationDays: number | null;
  departures: Departure[];
};

function statusLabel(status: string) {
  if (status === "AVAILABLE") return "Available";
  if (status === "ON_REQUEST") return "On request";
  if (status === "SOLD_OUT") return "Sold out";
  return status.replace(/_/g, " ").toLowerCase();
}

function TourDetailPage() {
  const { id } = Route.useParams();
  const load = useServerFn(getTourDossier);
  const loadDeparture = useServerFn(getTourDeparture);
  const reserve = useServerFn(reserveTourDeparture);
  const checkAvailability = useServerFn(checkTourAvailability);
  const [tour, setTour] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Departure | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);

  const [related, setRelated] = useState<TourCardData[]>([]);
  const loadRelated = useServerFn(getRelatedTours);
  const { toggle, isSaved } = useSavedTours();
  const [travellers, setTravellers] = useState(2);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const res = (await load({ data: { id, currency: "USD" } })) as {
          ok: boolean;
          error?: string;
          tour?: Detail;
        };
        if (!alive) return;
        if (res.ok && res.tour) {
          setTour(res.tour);
          recordTourView({
            id: res.tour.id,
            name: res.tour.name,
            image: res.tour.image,
            region: res.tour.region,
            fromPrice: res.tour.fromPrice,
            currency: res.tour.currency,
          });
        } else setError(res.error ?? "Tour unavailable.");
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, load]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = (await loadRelated({ data: { id, currency: "USD", limit: 3 } })) as {
          tours?: TourCardData[];
        };
        if (alive) setRelated(res.tours ?? []);
      } catch {
        /* related journeys are progressive enhancement */
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, loadRelated]);

  // Live availability re-check whenever the departure, room or party changes.
  useEffect(() => {
    if (!selected) {
      setAvailability(null);
      return;
    }
    let alive = true;
    setChecking(true);
    void (async () => {
      try {
        const res = (await checkAvailability({
          data: {
            departureId: selected.id,
            roomCode: roomCode || undefined,
            travellers,
            currency: "USD",
          },
        })) as Availability;
        if (alive) setAvailability(res);
      } catch {
        if (alive) setAvailability(null);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected, roomCode, travellers, checkAvailability]);

  async function onReserve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !tour) return;
    const form = new FormData(e.currentTarget);
    setBooking(true);
    setBookingMsg(null);
    try {
      const lead = {
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? "") || undefined,
      };
      const res = (await reserve({
        data: {
          departureId: selected.id,
          roomCode: roomCode || selected.rooms[0]?.code || "STANDARD",
          tourName: tour.name,
          startDate: selected.startDate,
          currency: "USD",
          travellers: Array.from({ length: travellers }, (_, i) =>
            i === 0
              ? lead
              : {
                  firstName: `${lead.firstName}`,
                  lastName: `${lead.lastName}`,
                  email: lead.email,
                },
          ),
        },
      })) as {
        ok: boolean;
        error?: string;
        reference?: string;
        bookingStatus?: string | null;
        amountDue?: number | null;
        currency?: string;
        captured?: boolean;
        soldOut?: boolean;
        needsCredentials?: boolean;
        needsBookingPermission?: boolean;
        availability?: Availability;
      };
      if (res.availability) setAvailability(res.availability);
      if (res.ok) {
        const due =
          res.amountDue != null ? ` Deposit due ${money(res.amountDue, res.currency ?? "USD")}.` : "";
        setBookingMsg(
          `Reservation held live with the operator — reference ${res.reference} (${(res.bookingStatus ?? "quote").toLowerCase()}).${due} Our travel desk will contact you to settle payment and issue documents.`,
        );
      } else {
        setBookingMsg(
          `${res.error ?? "Reservation could not be created."}${
            res.captured && !res.needsBookingPermission
              ? " Your details have been sent to our travel desk."
              : ""
          }`,
        );

      }
    } catch (err) {
      setBookingMsg(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBooking(false);
    }
  }

  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${tour?.image ?? "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=2000&q=80"})`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/75 to-background" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-28">
          <Link
            to="/tours"
            className="text-[10px] uppercase tracking-[0.3em] text-primary hover:underline"
          >
            ← All tours
          </Link>
          <nav
            aria-label="Breadcrumb"
            className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <span className="px-2">/</span>
            <Link to="/tours" className="hover:text-primary">
              Tours
            </Link>
            {tour?.region ? (
              <>
                <span className="px-2">/</span>
                <span>{tour.region}</span>
              </>
            ) : null}
          </nav>
          <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight text-foreground md:text-5xl">
            {tour?.name ?? (loading ? "Loading journey…" : "Journey")}
          </h1>
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {tour?.region ? <span>{tour.region}</span> : null}
            {tour?.durationDays ? <span>{tour.durationDays} days</span> : null}
            {tour?.startCity ? (
              <span>
                {tour.startCity} → {tour.finishCity ?? tour.startCity}
              </span>
            ) : null}
            {tour?.fromPrice != null ? (
              <span className="text-primary">from {money(tour.fromPrice, tour.currency)}</span>
            ) : null}
          </div>
          {tour ? (
            <button
              type="button"
              onClick={() =>
                toggle({
                  id: tour.id,
                  name: tour.name,
                  image: tour.image,
                  region: tour.region,
                  fromPrice: tour.fromPrice,
                  currency: tour.currency,
                })
              }
              className={`mt-6 rounded-full border px-6 py-2.5 text-[10px] uppercase tracking-[0.28em] transition-colors ${
                isSaved(tour.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/50 text-primary hover:bg-primary/10"
              }`}
            >
              {isSaved(tour.id) ? "Saved to shortlist" : "Save this journey"}
            </button>
          ) : null}
        </div>
        {tour ? (
          <script
            type="application/ld+json"
            // Structured data for rich results on guided journeys.
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "TouristTrip",
                name: tour.name,
                description: tour.description,
                image: tour.image ?? undefined,
                touristType: tour.categories,
                itinerary: {
                  "@type": "ItemList",
                  numberOfItems: tour.itinerary.length,
                  itemListElement: tour.itinerary.slice(0, 30).map((d) => ({
                    "@type": "ListItem",
                    position: d.day,
                    name: d.title,
                  })),
                },
                offers:
                  tour.fromPrice != null
                    ? {
                        "@type": "Offer",
                        price: tour.fromPrice,
                        priceCurrency: tour.currency,
                        availability: "https://schema.org/InStock",
                      }
                    : undefined,
              }),
            }}
          />
        ) : null}
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-12">
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {tour?.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{tour.description}</p>
          ) : null}

          {tour?.highlights ? (
            <div>
              <h2 className="font-serif text-2xl text-foreground">Highlights</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {tour.highlights}
              </p>
            </div>
          ) : null}

          {tour?.itinerary.length ? (
            <div>
              <h2 className="font-serif text-2xl text-foreground">Day-by-day itinerary</h2>
              <ol className="mt-6 space-y-6 border-l border-border/60 pl-6">
                {tour.itinerary.map((d) => (
                  <li key={d.day} className="relative">
                    <span className="absolute -left-[31px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="text-[10px] uppercase tracking-[0.28em] text-primary">
                      Day {d.day}
                    </div>
                    <h3 className="mt-1 font-serif text-lg text-foreground">{d.title}</h3>
                    {d.summary ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {d.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                      {d.accommodation ? <span>Stay · {d.accommodation}</span> : null}
                      {d.meals.length ? <span>Meals · {d.meals.join(", ")}</span> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {tour?.included ? (
            <div>
              <h2 className="font-serif text-2xl text-foreground">What's included</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tour.included}</p>
            </div>
          ) : null}

          {tour?.details.length ? (
            <div className="space-y-4">
              <h2 className="font-serif text-2xl text-foreground">Trip details</h2>
              {tour.details.map((d) => (
                <details
                  key={d.label}
                  className="rounded-xl border border-border/60 bg-card/50 p-4"
                >
                  <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-primary">
                    {d.label}
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {d.body}
                  </p>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">Live departures</div>
            <div className="mt-5 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading availability…</p>
              ) : tour?.departures.length ? (
                tour.departures.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelected(d);
                      setRoomCode(d.rooms[0]?.code ?? "");
                      setBookingMsg(null);
                      void (async () => {
                        const res = (await loadDeparture({
                          data: { departureId: d.id, currency: "USD" },
                        })) as { ok: boolean; departure?: Departure };
                        if (res.ok && res.departure) {
                          setSelected(res.departure);
                          setRoomCode(res.departure.rooms[0]?.code ?? "");
                        }
                      })();
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected?.id === d.id
                        ? "border-primary/70 bg-primary/10"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm text-foreground">
                      <span>
                        {new Date(d.startDate).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-primary">{money(d.price, d.currency)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span>{d.days ? `${d.days} days` : ""}</span>
                      <span>{statusLabel(d.status)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No live departures returned for this journey yet.
                </p>
              )}
            </div>
          </div>

          {selected ? (
            <form
              onSubmit={onReserve}
              className="space-y-4 rounded-2xl border border-primary/30 bg-card/80 p-6"
            >
              <div className="text-xs uppercase tracking-[0.3em] text-primary">Reserve</div>
              <p className="text-xs text-muted-foreground">
                {new Date(selected.startDate).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {money(selected.price, selected.currency)} per person
              </p>
              {selected.rooms.length > 1 ? (
                <Field label="Room">
                  <select
                    className={inputClass}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  >
                    {selected.rooms.map((r) => (
                      <option key={r.code} value={r.code} disabled={r.status !== "AVAILABLE"}>
                        {r.name} — {money(r.price, r.currency)}
                        {r.status !== "AVAILABLE" ? ` (${statusLabel(r.status)})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Travellers">
                <select
                  className={inputClass}
                  value={travellers}
                  onChange={(e) => setTravellers(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "traveller" : "travellers"}
                    </option>
                  ))}
                </select>
              </Field>
              <div
                className={`space-y-1 rounded-xl border p-3 text-[11px] uppercase tracking-[0.18em] ${
                  availability && !availability.bookable
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border/60 bg-background/40 text-muted-foreground"
                }`}
              >
                {checking ? (
                  <p>Checking live availability…</p>
                ) : availability ? (
                  <>
                    <p>
                      {availability.bookable ? "Live availability confirmed" : "Not bookable"}
                      {availability.room?.spaces != null
                        ? ` · ${availability.room.spaces} ${
                            availability.room.spaces === 1 ? "space" : "spaces"
                          } left`
                        : ""}
                    </p>
                    {availability.reason ? <p className="normal-case">{availability.reason}</p> : null}
                    {availability.totalPrice != null ? (
                      <p>
                        Live total ·{" "}
                        <span className="text-primary">
                          {money(availability.totalPrice, selected.currency)}
                        </span>
                      </p>
                    ) : null}
                    {availability.depositDue != null ? (
                      <p>Deposit due · {money(availability.depositDue, selected.currency)}</p>
                    ) : null}
                  </>
                ) : selected.price != null ? (
                  <p>
                    Estimated total ·{" "}
                    <span className="text-primary">
                      {money(selected.price * travellers, selected.currency)}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input name="firstName" required className={inputClass} />
                </Field>
                <Field label="Last name">
                  <input name="lastName" required className={inputClass} />
                </Field>
              </div>
              <Field label="Email">
                <input name="email" type="email" required className={inputClass} />
              </Field>
              <Field label="Phone">
                <input name="phone" className={inputClass} />
              </Field>
              <button
                type="submit"
                disabled={booking || checking || (availability ? !availability.bookable : false)}
                className="w-full rounded-full border border-primary/50 bg-primary/10 px-6 py-2.5 text-[10px] uppercase tracking-[0.28em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              >
                {booking
                  ? "Reserving"
                  : checking
                    ? "Checking availability"
                    : availability && !availability.bookable
                      ? "Not available"
                      : "Reserve live"}
              </button>

              {bookingMsg ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{bookingMsg}</p>
              ) : null}
            </form>
          ) : null}

          {tour?.map ? (
            <img
              src={tour.map}
              alt={`${tour.name} route map`}
              loading="lazy"
              className="w-full rounded-2xl border border-border/60"
            />
          ) : null}
        </aside>
      </div>

      {related.length ? (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="mb-6 font-serif text-2xl text-foreground">Similar journeys</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
