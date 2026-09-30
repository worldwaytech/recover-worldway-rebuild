import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { staffPrepareTourPaymentFn } from "@/lib/travelshop/tours.functions";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { PageHead, Panel, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/tour-payment")({
  head: adminHead("Staff tour payment", "Controlled staff-only paid tour booking for supplier certification."),
  component: TourPaymentPage,
});

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function TourPaymentPage() {
  const prepare = useServerFn(staffPrepareTourPaymentFn);
  const { pay, busy, error } = useRazorpayCheckout();
  const [f, setF] = useState({ slug: "", date: "", service: "regular" as "regular" | "private", adults: 1, children: 0, title: "Mr" as "Mr" | "Mrs" | "Ms" | "Miss" | "Dr", firstName: "", lastName: "", email: "", phoneCountryCode: "+91", phone: "" });
  const [prep, setPrep] = useState<{ bookingId: string; currency: string; total: number; checkedAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  async function onPrepare() {
    setWorking(true); setMsg(null); setPrep(null);
    try {
      const r = await prepare({ data: { slug: f.slug, date: f.date, service: f.service, adults: f.adults, children: f.children, lead: { title: f.title, firstName: f.firstName, lastName: f.lastName, email: f.email, phoneCountryCode: f.phoneCountryCode, phone: f.phone } } });
      if (r.ok) setPrep(r); else setMsg(r.reason);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not prepare."); } finally { setWorking(false); }
  }
  async function onPay() {
    if (!prep) return;
    const r = await pay({ purpose: "tour", tourBookingId: prep.bookingId, currency: prep.currency, description: "Worldway tour booking", name: `${f.firstName} ${f.lastName}`, email: f.email, phone: f.phone });
    if (r) setMsg(`Payment verified (${r.currency} ${(r.amountMinor / 100).toFixed(2)}). Now use "Send to partner" on the Tour Supplier page.`);
  }

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Tours & Activities" title="Staff tour payment" intro="Staff-only. For the controlled first paid tour booking. Only per-person priced tours are accepted; the price is re-checked live before payment and again before sending to the partner." />
      <Panel title="1 · Tour and lead traveller">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">Tour slug (from the tour page address)<input className={input} value={f.slug} onChange={set("slug")} /></label>
          <label className="text-xs">Date<input type="date" className={input} value={f.date} onChange={set("date")} /></label>
          <label className="text-xs">Option<select className={input} value={f.service} onChange={set("service")}><option value="regular">Regular</option><option value="private">Private</option></select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">Adults<input type="number" min={1} className={input} value={f.adults} onChange={set("adults")} /></label>
            <label className="text-xs">Children<input type="number" min={0} className={input} value={f.children} onChange={set("children")} /></label>
          </div>
          <label className="text-xs">Title<select className={input} value={f.title} onChange={set("title")}>{["Mr", "Mrs", "Ms", "Miss", "Dr"].map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-xs">First name<input className={input} value={f.firstName} onChange={set("firstName")} /></label>
          <label className="text-xs">Last name<input className={input} value={f.lastName} onChange={set("lastName")} /></label>
          <label className="text-xs">Email<input type="email" className={input} value={f.email} onChange={set("email")} /></label>
          <label className="text-xs">Phone country code<input className={input} value={f.phoneCountryCode} onChange={set("phoneCountryCode")} /></label>
          <label className="text-xs">Phone (digits only)<input className={input} value={f.phone} onChange={set("phone")} /></label>
        </div>
        <button disabled={working} onClick={onPrepare} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{working ? "Checking live…" : "Check live price & prepare"}</button>
      </Panel>
      {prep ? (
        <Panel title="2 · Pay">
          <p className="text-sm">Live total <b>{prep.currency} {prep.total.toFixed(2)}</b> · checked {new Date(prep.checkedAt).toLocaleString()}</p>
          <button disabled={busy} onClick={onPay} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Processing…" : "Pay now"}</button>
        </Panel>
      ) : null}
      {msg || error ? <p className="text-sm">{msg ?? error}</p> : null}
      <p className="text-xs text-muted-foreground">After payment: <Link to="/admin/tour-supplier" className="underline">Tour Supplier → Send to partner</Link>.</p>
    </div>
  );
}
