import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrystalVoyages, revalidateCrystalVoyage } from "@/lib/crystal/crystal.functions";
import {
  cancelCrystalReservation,
  confirmCrystalReservation,
  getCrystalAvailableSuites,
  getCrystalBookingCapability,
  holdCrystalSuite,
} from "@/lib/crystal/crystal-booking.functions";
import { hydrateLicensedVoyages, voyageByCode } from "@/lib/crystal/inventory";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_LABELS,
  type CrystalAvailableSuite,
  type CrystalBookingRecord,
} from "@/lib/crystal/booking-contract";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface LiveFare {
  gradeId?: string;
  gradeName?: string;
  fareCode?: string;
  fareType?: string;
  suiteCategory: string;
  price: number;
  currency: string;
  available?: boolean;
  availabilityCount?: number;
  availabilityLabel?: string;
}

export const Route = createFileRoute("/crystal-cruises/book/$code")({
  head: ({ params }) => {
    const url = `https://worldwaytravelsgroup.com/crystal-cruises/book/${params.code}`;
    const title = `Reserve Crystal voyage ${params.code} | Worldway Travels Group`;
    const description =
      "Select a suite grade, revalidate live Crystal fares and availability, hold your suite and complete your reservation with a Worldway cruise specialist.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  loader: async () => ({
    feed: await getCrystalVoyages({ data: {} }),
    capability: await getCrystalBookingCapability(),
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="font-serif text-2xl">We could not load this sailing</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Please try again, or contact our Crystal desk and we will reserve it for you.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="font-serif text-2xl">Voyage not found</h1>
    </div>
  ),
  component: BookPage,
});

type Guest = { firstName: string; lastName: string; dateOfBirth?: string; nationality?: string };

function newKey(): string {
  return `crz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function BookPage() {
  const { feed, capability } = Route.useLoaderData();
  hydrateLicensedVoyages(feed.voyages);
  const { code } = Route.useParams();
  const voyage = voyageByCode(code);

  const revalidate = useServerFn(revalidateCrystalVoyage);
  const fetchSuites = useServerFn(getCrystalAvailableSuites);
  const hold = useServerFn(holdCrystalSuite);
  const confirmFn = useServerFn(confirmCrystalReservation);
  const cancelFn = useServerFn(cancelCrystalReservation);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [fares, setFares] = useState<LiveFare[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<LiveFare | null>(null);
  const [suites, setSuites] = useState<CrystalAvailableSuite[]>([]);
  const [suitesLoading, setSuitesLoading] = useState(false);
  const [suitesError, setSuitesError] = useState("");
  const [suitesLive, setSuitesLive] = useState(false);
  const [selectedSuite, setSelectedSuite] = useState<CrystalAvailableSuite | null>(null);
  const [guests, setGuests] = useState<Guest[]>([{ firstName: "", lastName: "" }]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<CrystalBookingRecord | null>(null);
  const [message, setMessage] = useState<string>("");
  const [idemKey] = useState(newKey);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  const currency = voyage?.currency ?? "USD";

  useEffect(() => {
    if (!voyage || voyage.bookingMode === "enquiry") return;
    setChecking(true);

    revalidate({ data: { voyageNumber: voyage.code, currency } })
      .then((res) => {
        const list = ((res as { fares?: LiveFare[] }).fares ?? []).filter((f) => f.price > 0);
        setFares(list);
        if ((res as { error?: string }).error) toast.error((res as { error: string }).error);
      })
      .catch(() => setFares([]))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Step 2: open suite numbers for the chosen grade (documented available-suites op).
  useEffect(() => {
    setSelectedSuite(null);
    setSuites([]);
    setSuitesError("");
    setSuitesLive(false);
    if (!selected || !voyage || !selected.gradeId || !selected.fareCode) return;
    let cancelled = false;
    setSuitesLoading(true);
    fetchSuites({
      data: {
        voyageNumber: voyage.code,
        suiteCategoryCod: selected.gradeId,
        priceTypeCod: selected.fareCode,
        currency,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setSuites(res.suites);
        setSuitesLive(res.live && res.suites.length > 0);
        if (!res.live && res.error) setSuitesError(res.error);
      })
      .catch(() => {
        if (!cancelled) setSuitesError("Crystal could not return available suites right now.");
      })
      .finally(() => {
        if (!cancelled) setSuitesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, code]);

  const total = useMemo(
    () => (selected ? selected.price * guests.length : 0),
    [selected, guests.length],
  );

  if (!voyage) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-serif text-2xl">Voyage {code} is not currently published</h1>
        <Link to="/crystal-cruises/search" className="mt-4 inline-block text-sm underline">
          Browse the cruise finder
        </Link>
      </div>
    );
  }

  // World Cruises are published by Crystal but not distributed through our
  // supplier booking entitlement — these are reserved by our cruise desk.
  if (voyage.bookingMode === "enquiry") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.4em] text-primary">Crystal Cruises</p>
        <h1 className="mt-3 font-serif text-3xl">{voyage.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {voyage.shipName} · {voyage.nights} nights · {voyage.embarkPort} to{" "}
          {voyage.disembarkPort} · departs {voyage.departureDate}
          {voyage.priceFrom
            ? ` · fares from ${voyage.currency} ${voyage.priceFrom.toLocaleString()}`
            : ""}
        </p>
        <div className="mt-8 rounded-xl border border-border/60 bg-muted/30 p-6">
          <h2 className="font-serif text-xl">Reserved through our cruise desk</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Full world voyages are held and confirmed personally with Crystal, including suite
            selection, full and segment options, deposits and payment plans. Send your request and a
            Crystal specialist will come back with live suite availability and the current fare.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/crystal-cruises/quote"
              search={{ voyage: voyage.code }}
              className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Request this world cruise
            </Link>
            <Link
              to="/crystal-cruises/voyages/$code"
              params={{ code: voyage.code }}
              className="rounded-full border border-border px-6 py-2.5 text-sm"
            >
              View full itinerary
            </Link>
          </div>
        </div>
      </div>
    );
  }


  function setGuestCount(n: number) {
    setGuests((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push({ firstName: "", lastName: "" });
      return next;
    });
  }

  async function onHold() {
    if (!selected || !voyage) return toast.error("Select a suite grade first.");
    if (guests.some((g) => !g.firstName.trim() || !g.lastName.trim()))
      return toast.error("Enter each guest's full name.");
    setBusy(true);
    try {
      const res = await hold({
        data: {
          voyageNumber: voyage.code,
          voyageTitle: voyage.title,
          shipName: voyage.shipName,
          departureDate: voyage.departureDate || undefined,
          currency,
          fareCode: selected.fareCode,
          gradeId: selected.gradeId,
          suiteCategory: selected.suiteCategory,
          suiteNumber: selectedSuite?.suiteNumber,
          quotedPricePerGuest: selected.price,
          guests: guests.map((g) => ({
            firstName: g.firstName.trim(),
            lastName: g.lastName.trim(),
            dateOfBirth: g.dateOfBirth || undefined,
            nationality: g.nationality || undefined,
          })),
          leadEmail: email.trim(),
          leadPhone: phone.trim(),
          notes: notes.trim() || undefined,
          idempotencyKey: idemKey,
        },
      });
      setBooking(res.booking);
      setMessage(res.message);
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not hold this suite.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!booking) return;
    setBusy(true);
    try {
      const res = await confirmFn({
        data: { bookingId: booking.id, idempotencyKey: `${idemKey}_confirm`, acceptedTerms: true },
      });
      setBooking(res.booking);
      setMessage(res.message);
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!booking) return;
    if (cancelReason.trim().length < 3) return toast.error("Tell us why you are cancelling.");
    setBusy(true);
    try {
      const res = await cancelFn({ data: { bookingId: booking.id, reason: cancelReason.trim() } });
      setBooking(res.booking);
      setMessage(res.message);
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-[11px] uppercase tracking-[0.4em] text-primary">Crystal Cruises</p>
      <h1 className="mt-3 font-serif text-3xl">{voyage.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {voyage.shipName} · {voyage.nights} nights · {voyage.embarkPort} →{" "}
        {voyage.disembarkPort} · departs {voyage.departureDate || "TBC"}
      </p>

      {!capability.live ? (
        <div className="mt-6 rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p className="font-medium">Specialist-confirmed reservations</p>
          <p className="mt-1 text-muted-foreground">
            Live fares and suite availability come straight from Crystal. Final reservation is
            completed by our Crystal desk while the cruise line&apos;s reservation rail is being
            certified for direct instant confirmation.
          </p>
        </div>
      ) : null}

      {booking ? (
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Reservation {booking.reference}</CardTitle>
            <Badge variant={booking.status === "confirmed" ? "default" : "secondary"}>
              {STATUS_LABELS[booking.status] ?? booking.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">{message}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Suite</p>
                <p>{booking.suiteCategory ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p>{booking.guests}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total</p>
                <p>{booking.amount ? money(booking.amount, booking.currency) : "On request"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Crystal reference</p>
                <p>{booking.supplierReference ?? "Pending"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {booking.status !== "cancelled" && booking.status !== "cancellation_requested" ? (
                <Button onClick={onConfirm} disabled={busy || booking.status === "confirmed"}>
                  {booking.status === "confirmed" ? "Confirmed" : "Confirm reservation"}
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link to="/account/bookings">View in My Bookings</Link>
              </Button>
            </div>
            {booking.status !== "cancelled" && booking.status !== "cancellation_requested" ? (
              <div className="rounded-lg border border-border/60 p-4">
                <Label htmlFor="cancel-reason">Need to cancel?</Label>
                <Textarea
                  id="cancel-reason"
                  className="mt-2"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation"
                />
                <Button
                  variant="destructive"
                  className="mt-3"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Request cancellation
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>1 · Suite grade — live availability &amp; pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {checking ? <p className="text-muted-foreground">Checking Crystal…</p> : null}
              {!checking && fares && fares.length === 0 ? (
                <p className="text-muted-foreground">
                  No suites are currently open on this sailing. Our desk can waitlist you.
                </p>
              ) : null}
              {(fares ?? []).map((f, i) => {
                const active = selected === f;
                return (
                  <button
                    key={`${f.gradeId ?? f.fareCode ?? f.suiteCategory}-${i}`}
                    type="button"
                    onClick={() => setSelected(f)}
                    className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-left transition ${
                      active ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{f.gradeName ?? f.suiteCategory}</span>
                      <span className="block text-xs text-muted-foreground">
                        {f.fareType ?? "Published fare"}
                        {f.availabilityLabel ? ` · ${f.availabilityLabel}` : ""}
                        {typeof f.availabilityCount === "number"
                          ? ` · ${f.availabilityCount} available`
                          : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-medium">{money(f.price, f.currency || currency)}</span>
                      <span className="block text-xs text-muted-foreground">per guest</span>
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>2 · Choose your suite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selected ? (
                <p className="text-muted-foreground">Select a suite grade to see open suites.</p>
              ) : suitesLoading ? (
                <p className="text-muted-foreground">Loading available suites from Crystal…</p>
              ) : suitesError ? (
                <p className="text-muted-foreground">{suitesError}</p>
              ) : suites.length === 0 ? (
                <p className="text-muted-foreground">
                  Crystal is not showing individual suites for this grade right now. Our desk can
                  allocate one for you after you hold.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {suites.length} suite{suites.length === 1 ? "" : "s"} open in this grade — live
                    from Crystal.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {suites.map((s) => {
                      const active = selectedSuite?.suiteNumber === s.suiteNumber;
                      return (
                        <button
                          key={s.suiteNumber}
                          type="button"
                          onClick={() => setSelectedSuite(s)}
                          disabled={!s.available}
                          className={`rounded-lg border p-3 text-left transition disabled:opacity-50 ${
                            active
                              ? "border-primary bg-primary/5"
                              : "border-border/60 hover:bg-muted/40"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-medium">Suite {s.suiteNumber}</span>
                            <Badge variant={s.available ? "secondary" : "outline"}>
                              {s.statusDesc || (s.available ? "Available" : "Unavailable")}
                            </Badge>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {s.deckName ?? (s.deckNumber ? `Deck ${s.deckNumber}` : "")}
                            {s.suiteCapacity ? ` · ${s.suiteCapacity}` : ""}
                            {s.ada ? " · Accessible" : ""}
                            {s.connectedSuiteNumber ? ` · connects to ${s.connectedSuiteNumber}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>3 · Guests &amp; contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <Label>Guests</Label>
                {[1, 2, 3, 4].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={guests.length === n ? "default" : "outline"}
                    onClick={() => setGuestCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              {guests.map((g, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`fn-${i}`}>Guest {i + 1} first name</Label>
                    <Input
                      id={`fn-${i}`}
                      value={g.firstName}
                      onChange={(e) =>
                        setGuests((p) =>
                          p.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ln-${i}`}>Guest {i + 1} last name</Label>
                    <Input
                      id={`ln-${i}`}
                      value={g.lastName}
                      onChange={(e) =>
                        setGuests((p) =>
                          p.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lead-phone">Phone</Label>
                  <Input
                    id="lead-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes for our Crystal desk</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dining, celebrations, accessibility, flight arrangements…"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>4 · Hold your suite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {selected
                  ? `${money(total, currency)} for ${guests.length} guest${guests.length > 1 ? "s" : ""}${
                      selectedSuite ? ` · Suite ${selectedSuite.suiteNumber}` : ""
                    } (fare revalidated with Crystal at the moment you continue).`
                  : "Select a suite grade to see your total."}
              </p>
              {signedIn === false ? (
                <Button asChild>
                  <Link to="/auth">Sign in to hold this suite</Link>
                </Button>
              ) : (
                <Button
                  onClick={onHold}
                  disabled={busy || !selected || (suitesLive && !selectedSuite)}
                >
                  {busy ? "Holding…" : "Hold suite"}
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
