import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CreditCard, Loader2, Users, BedDouble } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CatalogueProduct } from "@/lib/catalogue-types";
import {
  departureOptions,
  money,
  priceBreakdown,
  type DepartureOption,
} from "@/lib/itinerary";
import { portal, type PortalUser } from "@/lib/portal-store";
import { trackCatalogueEvent } from "@/lib/catalogue-client";
import { createBookingEnquiry } from "@/lib/booking-requests.functions";

export function BookingPanel({ product }: { product: CatalogueProduct }) {
  const nav = useNavigate();
  const departures = useMemo(() => departureOptions(product), [product]);
  const [me, setMe] = useState<PortalUser | null>(null);
  const [dateIdx, setDateIdx] = useState(0);
  const [guests, setGuests] = useState(2);
  const [singleRoom, setSingleRoom] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestBooking = useServerFn(createBookingEnquiry);

  useEffect(() => {
    setMe(portal.session());
    return portal.subscribe(() => setMe(portal.session()));
  }, []);

  const departure: DepartureOption | null = departures[dateIdx] ?? null;
  const price = useMemo(
    () => priceBreakdown(product, guests, departure, singleRoom),
    [product, guests, departure, singleRoom],
  );
  const amountDue = payFull ? price.total : price.depositDue;
  const bookable = (product.priceFrom ?? 0) > 0 && departures.length > 0;

  async function reserve() {
    if (!me) {
      toast.error("Sign in to reserve this journey.");
      nav({ to: "/auth" });
      return;
    }
    if (!departure) return;

    setBusy(true);
    try {
      // Price, status and balances are established by the server, not here.
      const result = await requestBooking({
        data: {
          slug: product.slug,
          departureDate: departure.date,
          guests,
          singleRoom,
          payFull,
        },
      });
      trackCatalogueEvent("booking_request", { kind: product.kind, slug: product.slug });
      toast.success(
        `Reservation ${result.reference} created — ${money(result.amountDue)} due to confirm.`,
      );
      nav({ to: "/account/bookings" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reservation could not be created.");
    } finally {
      setBusy(false);
    }
  }

  if (!bookable) return null;

  return (
    <div className="rounded-sm border border-border bg-card p-6 shadow-soft">
      <p className="eyebrow text-gold">Book instantly</p>
      <p className="mt-2 font-serif text-3xl">{money(price.perGuest)}</p>
      <p className="text-xs text-muted-foreground">per guest · {product.duration ?? "Flexible"}</p>

      <div className="mt-5 space-y-4">
        <div>
          <Label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <CalendarDays className="h-3.5 w-3.5 text-gold" /> Departure
          </Label>
          <select
            value={dateIdx}
            onChange={(e) => setDateIdx(Number(e.target.value))}
            className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            {departures.map((d, i) => (
              <option key={d.date} value={i}>
                {d.label} — {d.status === "limited" ? `${d.seatsLeft} places left` : d.status}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="flex items-center gap-2 text-xs uppercase tracking-widest">
              <Users className="h-3.5 w-3.5 text-gold" /> Guests
            </Label>
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="flex items-center gap-2 text-xs uppercase tracking-widest">
              <BedDouble className="h-3.5 w-3.5 text-gold" /> Room
            </Label>
            <select
              value={singleRoom ? "single" : "shared"}
              onChange={(e) => setSingleRoom(e.target.value === "single")}
              className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="shared">Twin / double</option>
              <option value="single">Single occupancy</option>
            </select>
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-2 border-t border-border pt-5 text-sm">
        <li className="flex justify-between">
          <span className="text-muted-foreground">
            {money(price.perGuest)} × {guests}
          </span>
          <span>{money(price.subtotal)}</span>
        </li>
        {price.singleSupplement > 0 && (
          <li className="flex justify-between">
            <span className="text-muted-foreground">Single supplement</span>
            <span>{money(price.singleSupplement)}</span>
          </li>
        )}
        <li className="flex justify-between">
          <span className="text-muted-foreground">Taxes & service</span>
          <span>{money(price.taxes)}</span>
        </li>
        <li className="flex justify-between border-t border-border pt-2 font-medium">
          <span>Total</span>
          <span>{money(price.total)}</span>
        </li>
      </ul>

      <div className="mt-4 flex gap-2 rounded-sm border border-border p-1 text-xs">
        <button
          type="button"
          onClick={() => setPayFull(false)}
          className={`flex-1 rounded-sm px-3 py-2 ${!payFull ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          25% deposit · {money(price.depositDue)}
        </button>
        <button
          type="button"
          onClick={() => setPayFull(true)}
          className={`flex-1 rounded-sm px-3 py-2 ${payFull ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Pay in full
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button className="w-full" disabled={busy} onClick={() => void reserve()}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="mr-2 h-4 w-4" />
          )}
          Reserve · {money(amountDue)} due to confirm
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {me
          ? "Your reservation is held while our team confirms availability. Payment is taken securely, and the booking is confirmed only once payment clears."
          : "Sign in to reserve this journey and pay securely."}
      </p>
    </div>
  );
}