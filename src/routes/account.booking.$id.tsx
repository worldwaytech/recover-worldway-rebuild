import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bookingOps, money } from "@/lib/booking-ops";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account/booking/$id")({
  head: () => ({
    meta: [
      { title: "Booking workspace — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Track your Worldway booking: timeline, payments, instalments, documents and messages with our travel operations team.",
      },
      { property: "og:title", content: "Booking workspace — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Timeline, payments, instalments, documents and concierge messaging.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingWorkspace,
});

function BookingWorkspace() {
  const { id } = useParams({ from: "/account/booking/$id" });
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [requestType, setRequestType] = useState<"amendment" | "cancellation" | "refund">(
    "amendment",
  );
  const [requestDetails, setRequestDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const booking = useQuery({
    queryKey: ["booking", id],
    queryFn: () => bookingOps.get(id),
  });

  useEffect(() => {
    if (!booking.data) return;
    bookingOps
      .ensureLifecycle(booking.data)
      .then(() => qc.invalidateQueries({ queryKey: ["booking-ops", id] }))
      .catch(() => undefined);
  }, [booking.data, id, qc]);

  const events = useQuery({
    queryKey: ["booking-ops", id, "events"],
    queryFn: () => bookingOps.events(id),
  });
  const payments = useQuery({
    queryKey: ["booking-ops", id, "payments"],
    queryFn: () => bookingOps.payments(id),
  });
  const installments = useQuery({
    queryKey: ["booking-ops", id, "installments"],
    queryFn: () => bookingOps.installments(id),
  });
  const documents = useQuery({
    queryKey: ["booking-ops", id, "documents"],
    queryFn: () => bookingOps.documents(id),
  });
  const messages = useQuery({
    queryKey: ["booking-ops", id, "messages"],
    queryFn: () => bookingOps.messages(id),
  });
  const requests = useQuery({
    queryKey: ["booking-ops", id, "requests"],
    queryFn: () => bookingOps.requests(id),
  });

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["booking-ops", id] });

  if (booking.isLoading) return <EmptyState title="Loading booking…" />;
  if (booking.error || !booking.data) {
    return (
      <EmptyState
        title="We couldn't open this booking"
        hint="It may belong to another account. Return to your bookings list."
      />
    );
  }

  const b = booking.data;
  const currency = b.currency ?? "USD";

  return (
    <div className="space-y-6">
      <Panel
        title={b.title}
        description={`${b.product_type} · ref ${b.reference} · travel ${fmtDate(b.travel_date)}`}
        actions={
          <Link
            to="/account/bookings"
            className="text-xs uppercase tracking-widest text-primary underline-offset-4 hover:underline"
          >
            All bookings
          </Link>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Status" value={b.status} />
          <Stat label="Total" value={money(b.amount, currency)} />
          <Stat label="Paid" value={money(b.amount_paid, currency)} />
          <Stat label="Balance" value={money(b.balance_due, currency)} />
        </div>
        {b.supplier_reference && (
          <p className="mt-4 text-xs text-muted-foreground">
            Supplier reference {b.supplier_reference} · supplier status {b.supplier_status}
          </p>
        )}
      </Panel>

      <Panel title="Payment schedule" description="Deposit and balance instalments.">
        {installments.data?.length ? (
          <Rows>
            {installments.data.map((i) => (
              <Row
                key={i.id}
                title={i.label}
                meta={`Due ${fmtDate(i.due_date)}`}
                right={
                  <div className="text-right">
                    <div className="text-sm text-primary">{money(i.amount, i.currency)}</div>
                    <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                      {i.status}
                    </div>
                  </div>
                }
              />
            ))}
          </Rows>
        ) : (
          <EmptyState title="No instalments scheduled" />
        )}
      </Panel>

      <Panel title="Payments & refunds" description="Every movement against this booking.">
        {payments.data?.length ? (
          <Rows>
            {payments.data.map((p) => (
              <Row
                key={p.id}
                title={`${p.kind} · ${p.method}`}
                meta={`${fmtDate(p.created_at)}${p.gateway_reference ? ` · ${p.gateway_reference}` : ""}`}
                right={
                  <div className="text-right">
                    <div className="text-sm text-primary">{money(p.amount, p.currency)}</div>
                    <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                      {p.status}
                    </div>
                  </div>
                }
              />
            ))}
          </Rows>
        ) : (
          <EmptyState title="No payments recorded yet" />
        )}
      </Panel>

      <Panel
        title="Documents"
        description="Confirmations, invoices, receipts and vouchers."
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await bookingOps.issueDocument(b, "itinerary");
                await refreshAll();
                toast.success("Itinerary pack issued");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not issue document");
              } finally {
                setBusy(false);
              }
            }}
          >
            Generate itinerary pack
          </Button>
        }
      >
        {documents.data?.length ? (
          <Rows>
            {documents.data.map((d) => (
              <Row
                key={d.id}
                title={d.title}
                meta={`${d.reference} · issued ${fmtDate(d.issued_at)}`}
                right={
                  <a
                    href={`data:application/json;charset=utf-8,${encodeURIComponent(
                      JSON.stringify({ reference: d.reference, ...(d.content as object) }, null, 2),
                    )}`}
                    download={`${d.reference}.json`}
                    className="text-xs uppercase tracking-widest text-primary underline-offset-4 hover:underline"
                  >
                    Download
                  </a>
                }
              />
            ))}
          </Rows>
        ) : (
          <EmptyState title="No documents yet" />
        )}
      </Panel>

      <Panel title="Timeline" description="Every operational event on this booking.">
        {events.data?.length ? (
          <Rows>
            {events.data.map((e) => (
              <Row
                key={e.id}
                title={e.summary}
                meta={`${e.actor_label} · ${fmtDate(e.created_at)}`}
                right={
                  <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    {e.event_type}
                  </span>
                }
              />
            ))}
          </Rows>
        ) : (
          <EmptyState title="Timeline is being prepared…" />
        )}
      </Panel>

      <Panel title="Messages" description="Talk to your Worldway travel operations team.">
        <div className="space-y-3">
          {messages.data?.length ? (
            messages.data.map((m) => (
              <div key={m.id} className="rounded-xl border border-border/60 px-4 py-3">
                <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                  {m.author_label} · {fmtDate(m.created_at)}
                </div>
                <p className="mt-1 text-sm text-foreground">{m.body}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No messages yet" hint="Ask us anything about this booking." />
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message to your travel team…"
            className="flex-1 rounded-full border border-border/60 bg-background px-4 py-2 text-sm"
          />
          <Button
            disabled={busy || !message.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await bookingOps.sendMessage(b.id, message.trim());
                setMessage("");
                await refreshAll();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not send message");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </Button>
        </div>
      </Panel>

      <Panel title="Amendments, cancellations & refunds" description="Raise a request with our team.">
        {requests.data?.length ? (
          <Rows>
            {requests.data.map((r) => (
              <Row
                key={r.id}
                title={`${r.request_type} — ${r.status}`}
                meta={`${fmtDate(r.created_at)}${r.resolution ? ` · ${r.resolution}` : ""}`}
                right={
                  r.refund_amount != null ? (
                    <span className="text-sm text-primary">
                      {money(r.refund_amount, currency)}
                    </span>
                  ) : null
                }
              />
            ))}
          </Rows>
        ) : (
          <EmptyState title="No open requests" />
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as typeof requestType)}
            className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm"
          >
            <option value="amendment">Amendment</option>
            <option value="cancellation">Cancellation</option>
            <option value="refund">Refund</option>
          </select>
          <input
            value={requestDetails}
            onChange={(e) => setRequestDetails(e.target.value)}
            placeholder="Tell us what you need changed…"
            className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm"
          />
          <Button
            variant="outline"
            disabled={busy || !requestDetails.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await bookingOps.raiseRequest(b, requestType, requestDetails.trim());
                setRequestDetails("");
                await refreshAll();
                toast.success("Request submitted");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not submit request");
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-primary">{value}</div>
    </div>
  );
}