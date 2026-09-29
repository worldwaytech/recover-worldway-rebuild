import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/search-shell";
import { cancelMyTransfer, getMyTransferBooking } from "@/lib/hbx/transfers.functions";

export const Route = createFileRoute("/transfers/voucher/$reference")({
  head: () => ({
    meta: [
      { title: "Transfer voucher — Worldway Travels Group" },
      { name: "description", content: "Your transfer confirmation and voucher." },
      { property: "og:title", content: "Transfer voucher — Worldway Travels Group" },
      { property: "og:description", content: "Transfer confirmation and voucher." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoucherPage,
});

function money(v: number, c: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: c || "EUR" }).format(v);
  } catch {
    return `${v} ${c}`;
  }
}

function VoucherPage() {
  const { reference } = Route.useParams();
  const load = useServerFn(getMyTransferBooking);
  const cancel = useServerFn(cancelMyTransfer);
  const q = useQuery({ queryKey: ["transfer-voucher", reference], queryFn: () => load({ data: { reference } }) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = q.data;
  const v = b?.voucher;

  async function onCancel() {
    if (!confirm("Cancel this transfer? Cancellation charges may apply per the policy shown.")) return;
    setBusy(true);
    try {
      const r = await cancel({ data: { reference } });
      setMsg(r.status === "cancelled" ? "Your transfer has been cancelled." : `Status: ${r.status}`);
      await q.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl space-y-6 px-6 py-16">
        {q.isLoading ? <p>Loading…</p> : null}
        {q.isError ? <p>Please <Link to="/auth" className="underline">sign in</Link> to view this voucher.</p> : null}
        {q.isSuccess && !b ? <p>Booking not found.</p> : null}
        {b && !v ? (
          <div className="rounded-xl border p-6">
            <h1 className="text-2xl">Booking {b.reference}</h1>
            <p className="mt-2 text-sm">Status: {b.status}. {b.status === "cancelled" ? "This transfer is cancelled." : "Your voucher will be available once the transfer is confirmed."}</p>
          </div>
        ) : null}
        {v ? (
          <article className="space-y-6 rounded-2xl border border-border/60 bg-card p-8 print:border-0">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-primary">Transfer voucher</div>
                <h1 className="mt-1 text-2xl">Worldway reference {v.worldwayReference}</h1>
                <p className="text-sm">Booking confirmation date: {v.confirmationDate?.replace("T", " ")}</p>
                <p className="text-sm">Status: {b?.status === "cancelled" ? "CANCELLED" : v.status}</p>
              </div>
              <div className="text-right text-sm">
                <div>Lead passenger: <strong>{v.leadPassenger}</strong></div>
                <div>{v.holderPhone}</div>
                <div className="mt-2 text-lg font-semibold">{money(v.totalAmount, v.currency)}</div>
              </div>
            </header>
            <p className="rounded-md bg-muted p-3 text-sm font-medium">{v.payableStatement}</p>
            {v.legs.map((l, i) => (
              <section key={i} className="space-y-2 border-t border-border/50 pt-4 text-sm">
                <h2 className="text-base font-semibold">{l.serviceName}</h2>
                <div className="grid gap-1 md:grid-cols-2">
                  <div>From: <strong>{l.from}</strong></div>
                  <div>To: <strong>{l.to}</strong></div>
                  <div>Service date: {l.serviceDate ?? "—"}</div>
                  <div>Pickup time: {l.pickupTime ? l.pickupTime.slice(0, 5) : "To be confirmed (see below)"}</div>
                  <div>Passengers: {l.paxDistribution.adults} adult(s), {l.paxDistribution.children} child(ren), {l.paxDistribution.infants} infant(s)</div>
                  <div>Type: {l.transferType} · Vehicle: {l.vehicle} · Category: {l.category}</div>
                  {l.transport ? <div>Travel details: {l.transport}</div> : null}
                  {l.pickupAddress ? <div>Pickup address: {l.pickupAddress}</div> : null}
                </div>
                {l.checkPickup?.mustCheckPickupTime ? (
                  <p className="rounded-md border border-primary/50 p-2">
                    You must confirm your pickup time at <strong>{l.checkPickup.url}</strong>{" "}
                    {l.checkPickup.hoursBeforeConsulting ? `${l.checkPickup.hoursBeforeConsulting} hours before your service` : "before your service"}.
                  </p>
                ) : null}
                {l.details.length ? <p>Transfer details: {l.details.map((d) => `${d.name}: ${d.value ?? ""} ${d.description}`).join(" · ")}</p> : null}
                {l.extras.length ? <p>Extras: {l.extras.map((e) => `${e.name}${e.units ? ` × ${e.units}` : ""}`).join(", ")}</p> : null}
                {l.pickupDescription ? <p className="whitespace-pre-line"><strong>Pickup information:</strong> {l.pickupDescription}</p> : null}
                {l.remarks.filter((r) => r !== l.pickupDescription).map((r, j) => <p key={j} className="whitespace-pre-line"><strong>Remarks:</strong> {r}</p>)}
                {l.cancellationPolicies.map((p, j) => (
                  <p key={j} className="text-xs text-muted-foreground">Cancellation: from {p.from.replace("T", " ")} local time (UTC{p.utcOffset}) {money(p.amount, p.currency)}</p>
                ))}
              </section>
            ))}
            {v.clientRemark ? <p className="text-sm">Your remarks: {v.clientRemark}</p> : null}
            <div className="flex gap-3 print:hidden">
              <button onClick={() => window.print()} className="rounded-full border px-5 py-2 text-xs uppercase tracking-widest">Print voucher</button>
              {b?.status === "confirmed" ? (
                <button disabled={busy} onClick={onCancel} className="rounded-full border border-destructive px-5 py-2 text-xs uppercase tracking-widest text-destructive">
                  {busy ? "Cancelling…" : "Cancel transfer"}
                </button>
              ) : null}
            </div>
            {msg ? <p className="text-sm">{msg}</p> : null}
          </article>
        ) : null}
      </section>
    </PageShell>
  );
}
