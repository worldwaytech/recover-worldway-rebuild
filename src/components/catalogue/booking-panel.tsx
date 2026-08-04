import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, CreditCard, Wallet, Loader2, Users, BedDouble } from "lucide-react";
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
import { chargeWallet, ledger, shortfall } from "@/lib/wallet-ledger";
import { accountApi } from "@/lib/account-data";
import { trackCatalogueEvent } from "@/lib/catalogue-client";

const SUPPLIER_MAP: Record<string, "cruises" | "rail" | "private_jets" | "activities" | "packages"> =
  {
    cruises: "cruises",
    "cruises-expedition": "cruises",
    "cruises-river": "cruises",
    "cruises-world": "cruises",
    rail: "rail",
    aviation: "private_jets",
    activities: "activities",
  };

export function BookingPanel({ product }: { product: CatalogueProduct }) {
  const nav = useNavigate();
  const departures = useMemo(() => departureOptions(product), [product]);
  const [me, setMe] = useState<PortalUser | null>(null);
  const [dateIdx, setDateIdx] = useState(0);
  const [guests, setGuests] = useState(2);
  const [singleRoom, setSingleRoom] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

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
  const balance = useMemo(
    () => (me ? ledger.balance(me.email, "USD") : 0),
    [me, tick],
  );
  const bookable = (product.priceFrom ?? 0) > 0 && departures.length > 0;

  async function confirm(via: "wallet" | "gateway") {
    if (!me) {
      toast.error("Sign in to complete your booking.");
      nav({ to: "/auth" });
      return;
    }
    if (!departure) return;
    const reference = `WW-${product.slug.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const label = `${product.title} · ${departure.label}`;

    if (via === "gateway" || balance < amountDue) {
      shortfall.set({
        amount: Math.max(amountDue - (via === "gateway" ? 0 : balance), 1),
        currency: "USD",
        returnTo: typeof window !== "undefined" ? window.location.pathname : "/",
        label,
      });
      toast.info(
        via === "gateway"
          ? "Complete secure payment to confirm this booking."
          : `Wallet short by ${money(amountDue - balance)} — top up to confirm.`,
      );
      nav({ to: "/wallet" });
      return;
    }

    setBusy(true);
    try {
      const charge = chargeWallet({
        userEmail: me.email,
        amount: amountDue,
        currency: "USD",
        supplier: SUPPLIER_MAP[product.kind] ?? "packages",
        bookingRef: reference,
        description: label,
      });
      if (!charge.ok) {
        shortfall.set({
          amount: charge.shortfall,
          currency: "USD",
          returnTo: typeof window !== "undefined" ? window.location.pathname : "/",
          label,
        });
        nav({ to: "/wallet" });
        return;
      }
      await accountApi.addBooking({
        reference,
        title: product.title,
        product_type: product.kind,
        supplier: product.supplier,
        status: payFull ? "confirmed" : "deposit-paid",
        currency: "USD",
        amount: price.total,
        travel_date: departure.date,
        details: {
          guests,
          singleRoom,
          paid: amountDue,
          balanceDue: payFull ? 0 : price.balanceDue,
          perGuest: price.perGuest,
          taxes: price.taxes,
          location: product.location,
          slug: product.slug,
          gateway: "wallet",
        },
      });
      trackCatalogueEvent("booking_conversion", { kind: product.kind, slug: product.slug });
      setTick((t) => t + 1);
      toast.success(`Booking ${reference} confirmed — paid ${money(amountDue)} from your wallet.`);
      nav({ to: "/account/bookings" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Booking could not be completed.");
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
        <Button className="w-full" disabled={busy} onClick={() => confirm("wallet")}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="mr-2 h-4 w-4" />
          )}
          Pay {money(amountDue)} with wallet
        </Button>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => confirm("gateway")}>
          <CreditCard className="mr-2 h-4 w-4" /> Card, UPI or PayPal
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {me
          ? `Wallet balance ${money(balance)}. Top-ups settle instantly via Razorpay or PayPal.`
          : "Sign in to pay from your Worldway wallet or a card."}
      </p>
    </div>
  );
}