import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatCruiseaDate,
  formatCruiseaMoney,
  type CruiseaBooking,
} from "@/lib/cruisea/types";
import {
  cancelCruiseaBookingFn,
  confirmCruiseaBookingFn,
  getCruiseaBookingFn,
  listCruiseaBookingsFn,
} from "@/lib/cruisea/cruisea.functions";
import { useCruiseaSession } from "./use-cruisea-session";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Confirmed") return "default";
  if (status === "Cancelled") return "destructive";
  if (status === "Held") return "secondary";
  return "outline";
}

function SignInPrompt({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button className="mt-4" asChild>
        <Link to="/auth">Sign in</Link>
      </Button>
    </div>
  );
}

export function CruiseaBookingsList() {
  const session = useCruiseaSession();
  const list = useServerFn(listCruiseaBookingsFn);
  const query = useQuery({
    queryKey: ["cruisea-bookings"],
    queryFn: () => list({ data: undefined }) as Promise<CruiseaBooking[]>,
    enabled: session.signedIn,
  });

  if (session.loading) {
    return <p className="text-sm text-muted-foreground">Loading your voyages…</p>;
  }
  if (!session.signedIn) {
    return <SignInPrompt message="Sign in to see and manage your Cruisea bookings." />;
  }
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your voyages…</p>;
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
        We could not load your bookings.{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const bookings = query.data ?? [];
  if (!bookings.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">You have no Cruisea bookings yet.</p>
        <Button className="mt-4" asChild>
          <Link to="/voyages/cruisea">Browse Cruisea voyages</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <article
          key={booking.id}
          className="rounded-2xl border border-border/60 bg-card/60 p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-primary">
                {booking.reference ?? "Reference pending"}
              </div>
              <h3 className="mt-1 font-serif text-2xl text-foreground">
                {booking.sailing?.title ?? "Cruisea voyage"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {booking.sailing
                  ? `${booking.sailing.cruiseLine} · ${booking.sailing.shipName} · departs ${formatCruiseaDate(booking.sailing.departureDate)}`
                  : ""}
              </p>
            </div>
            <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-4">
            <span>
              {booking.cabin ? `${booking.cabin.category} · ${booking.cabin.label}` : "Cabin"}
            </span>
            <span>{booking.guestCount} guests</span>
            <span>{formatCruiseaMoney(booking.totalPrice, booking.currency)}</span>
            <span>Payment: {booking.paymentStatus}</span>
          </div>
          <div className="mt-5">
            <Button variant="outline" asChild>
              <Link to="/voyages/cruisea/booking/$id" params={{ id: booking.id }}>
                Manage booking
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CruiseaBookingDetailView({ bookingId }: { bookingId: string }) {
  const session = useCruiseaSession();
  const queryClient = useQueryClient();
  const get = useServerFn(getCruiseaBookingFn);
  const confirm = useServerFn(confirmCruiseaBookingFn);
  const cancel = useServerFn(cancelCruiseaBookingFn);

  const query = useQuery({
    queryKey: ["cruisea-booking", bookingId],
    queryFn: () => get({ data: { bookingId } }) as Promise<CruiseaBooking | null>,
    enabled: session.signedIn,
  });

  async function onConfirm() {
    try {
      await confirm({ data: { bookingId } });
      toast.success("Voyage confirmed. Our cruise desk will follow up with payment details.");
      await queryClient.invalidateQueries({ queryKey: ["cruisea-booking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["cruisea-bookings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not confirm this booking.");
    }
  }

  async function onCancel() {
    try {
      await cancel({ data: { bookingId } });
      toast.success("Booking cancelled and the cabin released.");
      await queryClient.invalidateQueries({ queryKey: ["cruisea-booking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["cruisea-bookings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not cancel this booking.");
    }
  }

  if (session.loading || query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your booking…</p>;
  }
  if (!session.signedIn) {
    return <SignInPrompt message="Sign in to view this Cruisea booking." />;
  }
  const booking = query.data;
  if (!booking) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">That booking is not available.</p>
        <Button className="mt-4" asChild>
          <Link to="/voyages/cruisea/bookings">Back to my bookings</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-primary">
              {booking.reference ?? "Reference pending"}
            </div>
            <h2 className="mt-1 font-serif text-3xl text-foreground">
              {booking.sailing?.title ?? "Cruisea voyage"}
            </h2>
          </div>
          <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Ship" value={booking.sailing?.shipName ?? "—"} />
          <Row label="Cruise line" value={booking.sailing?.cruiseLine ?? "—"} />
          <Row
            label="Departs"
            value={booking.sailing ? formatCruiseaDate(booking.sailing.departureDate) : "—"}
          />
          <Row
            label="Route"
            value={
              booking.sailing
                ? `${booking.sailing.embarkationPort} → ${booking.sailing.disembarkationPort}`
                : "—"
            }
          />
          <Row
            label="Cabin"
            value={booking.cabin ? `${booking.cabin.category} · ${booking.cabin.label}` : "—"}
          />
          <Row label="Guests" value={String(booking.guestCount)} />
          <Row label="Total" value={formatCruiseaMoney(booking.totalPrice, booking.currency)} />
          <Row label="Payment" value={booking.paymentStatus} />
        </dl>

        {booking.holdExpiresAt && booking.status === "Held" ? (
          <p className="mt-4 text-xs text-primary">
            Hold expires {new Date(booking.holdExpiresAt).toLocaleString("en-GB")}.
          </p>
        ) : null}

        {booking.passengers.length ? (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Guests
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {booking.passengers.map((p) => (
                <li key={p.id}>
                  {p.firstName} {p.lastName}
                  {p.dateOfBirth ? ` · ${formatCruiseaDate(p.dateOfBirth)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {booking.notes ? (
          <p className="mt-6 text-sm text-muted-foreground">Notes: {booking.notes}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {booking.status === "Held" || booking.status === "Inquiry" ? (
            <Button onClick={onConfirm}>Confirm this voyage</Button>
          ) : null}
          {booking.status !== "Cancelled" ? (
            <Button variant="outline" onClick={onCancel}>
              Cancel booking
            </Button>
          ) : null}
          <Button variant="ghost" asChild>
            <Link to="/voyages/cruisea/bookings">All my Cruisea bookings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
