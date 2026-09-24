import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminListMerchantBookings,
  adminMerchantSmokeTest,
} from "@/lib/viator-merchant/merchant.functions";

export const Route = createFileRoute("/admin/viator-merchant")({
  head: () => ({
    meta: [
      { title: "Merchant (Sandbox) — Worldway Admin" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminViatorMerchantPage,
});

type SmokeResult = {
  ok: boolean;
  environment: string;
  bookingMode: string;
  steps: { step: string; ok: boolean; detail?: string }[];
};

function AdminViatorMerchantPage() {
  const [smoke, setSmoke] = useState<SmokeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin-merchant-bookings"],
    queryFn: () => adminListMerchantBookings(),
    retry: false,
  });

  async function runSmoke() {
    setBusy(true);
    try {
      setSmoke(await adminMerchantSmokeTest({ data: {} }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Viator — Merchant (Sandbox)</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Isolated sandbox integration. Merchant booking mode: no supplier payment
        session; customer payment stays with Worldway. Production is untouched.
      </p>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={runSmoke}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Running…" : "Run read-only smoke test"}
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md border border-border px-4 py-2 text-foreground"
        >
          Refresh bookings
        </button>
      </div>

      {smoke && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="font-medium text-foreground">
            Environment: {smoke.environment} · {smoke.ok ? "PASS" : "FAIL"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{smoke.bookingMode}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {smoke.steps.map((s) => (
              <li key={s.step} className={s.ok ? "text-foreground" : "text-destructive"}>
                {s.ok ? "✓" : "✗"} {s.step}
                {s.detail ? ` — ${s.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-lg font-medium text-foreground">Sandbox bookings</h2>
      {isLoading && <p className="mt-3 text-muted-foreground">Loading…</p>}
      {data && !data.ok && <p className="mt-3 text-muted-foreground">Staff access required.</p>}
      {data?.ok && (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4">Reference</th>
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.bookings.map((b) => (
              <tr key={b.id} className="border-b border-border">
                <td className="py-2 pr-4 text-foreground">{b.partner_booking_ref}</td>
                <td className="py-2 pr-4 text-foreground">{b.product_title ?? b.product_code}</td>
                <td className="py-2 pr-4 text-foreground">{b.travel_date}</td>
                <td className="py-2 pr-4 text-foreground">
                  {b.retail_price !== null ? `${b.currency} ${Number(b.retail_price).toFixed(2)}` : "—"}
                </td>
                <td className="py-2 pr-4 text-foreground">{b.status}</td>
                <td className="py-2 text-foreground">{b.payment_status}</td>
              </tr>
            ))}
            {data.bookings.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-muted-foreground">No sandbox bookings yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
