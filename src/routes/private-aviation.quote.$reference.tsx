import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/search-shell";
import { completeAviationPayment, getMyAviationQuote } from "@/lib/aviation/private-aviation.functions";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { SignInPrompt, useSignedInEmail } from "@/components/aviation/contact-fields";
import { STATUS_LABEL, formatMoney } from "@/lib/aviation/quote";

export const Route = createFileRoute("/private-aviation/quote/$reference")({
  head: ({ params }) => ({
    meta: [
      { title: `Private aviation ${params.reference} — Worldway Private Aviation` },
      { name: "description", content: "Track your private jet request, review your confirmed quote, pay securely and download your receipt." },
      { property: "og:title", content: "Your private aviation request — Worldway" },
      { property: "og:description", content: "Confirmed quote, secure payment and receipt from Worldway Private Aviation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuotePage,
});

function QuotePage() {
  const { reference } = Route.useParams();
  const auth = useSignedInEmail();
  const getFn = useServerFn(getMyAviationQuote);
  const completeFn = useServerFn(completeAviationPayment);
  const { pay, busy, error: payError } = useRazorpayCheckout();
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["aviation-quote", reference],
    queryFn: () => getFn({ data: { reference } }),
    enabled: !!auth.email,
    retry: false,
  });
  const r = q.data?.ok ? q.data.request : null;
  const expired = r?.quote_expires_at && new Date(r.quote_expires_at).getTime() <= Date.now();

  async function onPay() {
    if (!r) return;
    setMsg(null);
    const res = await pay({
      purpose: "private_aviation",
      aviationReference: reference,
      currency: r.quote_currency,
      description: `Worldway Private Aviation ${reference}`,
      name: r.customer_name ?? undefined,
      email: r.customer_email ?? undefined,
      phone: r.customer_phone ?? undefined,
    });
    if (!res) return;
    const done = await completeFn({ data: { reference, orderId: res.orderId, paymentId: res.paymentId } });
    if (!done.ok) setMsg(`Payment received (ID ${res.paymentId}), but we couldn't finalise it automatically: ${done.error} Our desk will confirm shortly.`);
    await q.refetch();
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <div className="text-xs uppercase tracking-[0.3em] text-primary">Worldway Private Aviation</div>
        <h1 className="mt-2 font-serif text-4xl">Request {reference}</h1>

        {!auth.ready ? null : !auth.email ? (
          <div className="mt-8"><SignInPrompt what="view this request" /></div>
        ) : q.isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        ) : !r ? (
          <p className="mt-8 text-sm text-muted-foreground">{q.data && !q.data.ok ? q.data.error : "We couldn't load this request."}</p>
        ) : (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-serif text-2xl">{r.origin} → {r.destination}</span>
                <span data-testid="aviation-status" className="rounded-full border border-primary/40 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-primary">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-muted-foreground md:grid-cols-4">
                <div>Type<div className="text-foreground">{r.kind === "empty_leg" ? "Empty leg" : "Charter"}</div></div>
                <div>Departure<div className="text-foreground">{r.departure_date ?? "—"}</div></div>
                <div>Passengers<div className="text-foreground">{r.passengers}</div></div>
                <div>Aircraft<div className="text-foreground">{r.quote_details?.aircraft ?? r.aircraft_category ?? "—"}</div></div>
              </div>
            </div>

            {r.status === "quoted" && !r.paid_at && (
              <div className="rounded-2xl border border-primary/50 bg-primary/5 p-6">
                <div className="text-xs uppercase tracking-[0.3em] text-primary">Confirmed quote · version {r.quote_version}</div>
                <div className="mt-2 font-serif text-4xl">{formatMoney(Number(r.quote_amount), r.quote_currency)}</div>
                {r.quote_details?.inclusions && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{r.quote_details.inclusions}</p>}
                <p className="mt-3 text-xs text-muted-foreground">Valid until {new Date(r.quote_expires_at).toLocaleString()}.</p>
                {expired ? (
                  <p className="mt-4 text-sm">This quote has expired. Please contact aviation@worldwaytravelsgroup.com to reconfirm.</p>
                ) : (
                  <button onClick={onPay} disabled={busy} className="mt-5 rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-50">
                    {busy ? "Opening secure payment…" : "Pay securely"}
                  </button>
                )}
                {payError && <p className="mt-3 text-sm text-destructive">{payError}</p>}
              </div>
            )}

            {r.paid_at && <Receipt r={r} />}
            {msg && <p className="text-sm">{msg}</p>}
            {!["quoted", "paid", "booked"].includes(r.status) && (
              <p className="text-sm text-muted-foreground">Our Private Aviation desk is preparing your confirmed quote. It will appear here with a secure payment link.</p>
            )}
            <Link to="/account" className="text-xs uppercase tracking-[0.3em] text-primary hover:underline">← My account</Link>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Receipt({ r }: { r: Record<string, any> }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm print:border-0">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary">Worldway Travels Group · Receipt</div>
          <div data-testid="receipt-number" className="mt-1 font-mono">{r.receipt_number}</div>
        </div>
        <button onClick={() => window.print()} className="text-xs uppercase tracking-[0.3em] text-primary hover:underline print:hidden">Print / save PDF</button>
      </div>
      <table className="mt-4 w-full">
        <tbody>
          {[
            ["Worldway reference", r.reference],
            ["Customer", r.customer_name],
            ["Service", `Private jet ${r.kind === "empty_leg" ? "empty leg" : "charter"} ${r.origin} → ${r.destination}`],
            ["Departure", r.departure_date ?? "—"],
            ["Aircraft", r.quote_details?.aircraft ?? "—"],
            ["Amount paid", formatMoney(Number(r.paid_amount), r.paid_currency)],
            ["Paid on", new Date(r.paid_at).toLocaleString()],
            ["Payment ID", r.payment_id],
          ].map(([k, v]) => (
            <tr key={k} className="border-t border-border/50">
              <td className="py-2 text-muted-foreground">{k}</td>
              <td className="py-2 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
