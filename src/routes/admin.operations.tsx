import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { bookingOps, money, type Booking } from "@/lib/booking-ops";
import { StatTile } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/components/account/account-ui";

export const Route = createFileRoute("/admin/operations")({
  head: () => ({
    meta: [
      { title: "Booking operations — Worldway Admin" },
      {
        name: "description",
        content: "Operational queue for live bookings, payments, documents and customer requests.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Booking operations — Worldway Admin" },
      {
        property: "og:description",
        content: "Operational queue for live bookings, payments, documents and customer requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationsConsole,
});

const STATUSES = ["pending", "confirmed", "ticketed", "travelling", "completed", "cancelled"];

function OperationsConsole() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bookings = useQuery({ queryKey: ["ops", "bookings"], queryFn: bookingOps.all });
  const rows = (bookings.data ?? []).filter((b) => filter === "all" || b.status === filter);
  const outstanding = (bookings.data ?? []).reduce(
    (s, b) => s + Number(b.balance_due ?? 0),
    0,
  );

  const current = rows.find((b) => b.id === selected) ?? null;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["ops"] });
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Operations</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Booking operations console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live queue backed by the booking lifecycle: statuses, payments, documents and customer
          requests.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Bookings" value={String(bookings.data?.length ?? 0)} />
        <StatTile
          label="Awaiting action"
          value={String((bookings.data ?? []).filter((b) => b.status === "pending").length)}
        />
        <StatTile
          label="Confirmed"
          value={String((bookings.data ?? []).filter((b) => b.status === "confirmed").length)}
        />
        <StatTile label="Outstanding balance" value={money(outstanding)} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-border/60 p-1">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-widest transition ${
              filter === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          {rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {bookings.isLoading ? "Loading queue…" : "No bookings in this view."}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-primary/5 ${
                    selected === b.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{b.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {b.reference} · {b.product_type} · travel {fmtDate(b.travel_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-primary">
                      {money(b.amount, b.currency ?? "USD")}
                    </div>
                    <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                      {b.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
          {!current ? (
            <p className="text-sm text-muted-foreground">
              Select a booking to manage its lifecycle.
            </p>
          ) : (
            <BookingOpsPanel booking={current} busy={busy} act={act} />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Customers see the same lifecycle in their{" "}
        <Link to="/account/bookings" className="text-primary underline-offset-4 hover:underline">
          booking workspace
        </Link>
        .
      </p>
    </div>
  );
}

function BookingOpsPanel({
  booking,
  busy,
  act,
}: {
  booking: Booking;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const currency = booking.currency ?? "USD";

  const requests = useQuery({
    queryKey: ["ops", "requests", booking.id],
    queryFn: () => bookingOps.requests(booking.id),
  });
  const events = useQuery({
    queryKey: ["ops", "events", booking.id],
    queryFn: () => bookingOps.events(booking.id),
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          {booking.reference}
        </div>
        <h2 className="font-serif text-xl text-primary">{booking.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paid {money(booking.amount_paid, currency)} · balance{" "}
          {money(booking.balance_due, currency)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={booking.status === s ? "default" : "outline"}
            disabled={busy || booking.status === s}
            onClick={() => act(() => bookingOps.setStatus(booking, s, note || undefined), `Moved to ${s}`)}
          >
            {s}
          </Button>
        ))}
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note attached to the next action…"
        className="w-full rounded-full border border-border/60 bg-background px-4 py-2 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={`Amount (${currency})`}
          className="w-40 rounded-full border border-border/60 bg-background px-4 py-2 text-sm"
        />
        <Button
          size="sm"
          disabled={busy || !Number(amount)}
          onClick={() =>
            act(
              () =>
                bookingOps.recordPayment(booking, {
                  amount: Number(amount),
                  method: "manual",
                  note: note || undefined,
                }),
              "Payment recorded",
            )
          }
        >
          Record payment
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !Number(amount)}
          onClick={() =>
            act(
              () =>
                bookingOps.recordPayment(booking, {
                  amount: Number(amount),
                  kind: "refund",
                  method: "manual",
                  note: note || undefined,
                }),
              "Refund recorded",
            )
          }
        >
          Refund
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["invoice", "voucher", "itinerary"] as const).map((d) => (
          <Button
            key={d}
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act(() => bookingOps.issueDocument(booking, d), `${d} issued`)}
          >
            Issue {d}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !note.trim()}
          onClick={() =>
            act(() => bookingOps.sendMessage(booking.id, note.trim(), true), "Internal note added")
          }
        >
          Add internal note
        </Button>
      </div>

      <div>
        <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          Open requests
        </div>
        {requests.data?.filter((r) => r.status === "open").length ? (
          <ul className="mt-2 space-y-2">
            {requests.data
              .filter((r) => r.status === "open")
              .map((r) => (
                <li key={r.id} className="rounded-xl border border-border/60 px-3 py-2 text-xs">
                  <div className="uppercase tracking-widest text-primary">{r.request_type}</div>
                  <p className="mt-1 text-muted-foreground">{r.details}</p>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">None.</p>
        )}
      </div>

      <div>
        <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          Recent timeline
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {(events.data ?? []).slice(0, 6).map((e) => (
            <li key={e.id}>
              {fmtDate(e.created_at)} — {e.summary}
            </li>
          ))}
          {(events.data ?? []).length === 0 && <li>No events yet.</li>}
        </ul>
      </div>
    </div>
  );
}