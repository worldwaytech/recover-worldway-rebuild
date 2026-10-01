import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listFeePolicies, saveFeePolicy } from "@/lib/payments/fee-policy.functions";
import { formatMinor } from "@/lib/payments/plans";

export const Route = createFileRoute("/admin/payment-fees")({
  head: () => ({
    meta: [
      { title: "Payment Fee Policy — Worldway Admin" },
      { name: "description", content: "Who pays the payment processing fee, by product and payment method, and the actual gateway fees recorded." },
      { property: "og:title", content: "Payment Fee Policy — Worldway Admin" },
      { property: "og:description", content: "Payment fee rules and recorded gateway costs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const PRODUCTS = ["*", "flight", "hotel", "bus", "tour", "activity", "cruise", "rail", "transfer", "private_aviation", "wallet_topup", "membership"];
const METHODS = ["*", "card", "upi", "netbanking", "wallet"];

function Page() {
  const list = useServerFn(listFeePolicies);
  const save = useServerFn(saveFeePolicy);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fee-policies"], queryFn: () => list() });
  const [product, setProduct] = useState("*");
  const [method, setMethod] = useState("*");
  const [mode, setMode] = useState<"absorb" | "pass_through">("absorb");

  async function onSave() {
    try {
      await save({ data: { product, method, mode, serviceFeePercent: 0 } });
      toast.success("Rule saved");
      void qc.invalidateQueries({ queryKey: ["fee-policies"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Payments</p>
        <h1 className="font-serif text-3xl">Payment fee policy</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Default everywhere: Worldway pays the processing fee. Wallet payments never carry a fee. Customer-paid fees
          need Razorpay's "customer fee bearer" switched on for the account; a Worldway service fee is not active.
        </p>
      </div>

      <section className="rounded-md border border-border p-4">
        <h2 className="font-medium">Rules</h2>
        {q.isLoading ? <p className="text-sm">Loading…</p> : q.error ? <p className="text-sm text-destructive">Staff access required.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Product</th><th>Method</th><th>Who pays</th><th>Service fee</th></tr></thead>
            <tbody>
              {(q.data?.rules ?? []).length === 0 ? <tr><td colSpan={4} className="py-2">No overrides — Worldway absorbs all fees.</td></tr> : null}
              {(q.data?.rules ?? []).map((r: any) => (
                <tr key={`${r.product}-${r.method}`}><td>{r.product}</td><td>{r.method}</td><td>{r.mode === "absorb" ? "Worldway" : "Customer"}</td><td>{Number(r.service_fee_percent)}%</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-2 text-sm">
          <select className="rounded border border-border bg-background px-2 py-1" value={product} onChange={(e) => setProduct(e.target.value)}>{PRODUCTS.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="rounded border border-border bg-background px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          <select className="rounded border border-border bg-background px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as never)}>
            <option value="absorb">Worldway pays</option><option value="pass_through">Customer pays</option>
          </select>
          <Button size="sm" onClick={onSave}>Save rule</Button>
        </div>
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="font-medium">Actual gateway fees (reported by Razorpay)</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Product</th><th>Payments</th><th>Collected</th><th>Fee</th><th>of which tax</th><th>Effective</th></tr></thead>
          <tbody>
            {(q.data?.actualFees ?? []).length === 0 ? <tr><td colSpan={6} className="py-2">No fees recorded yet — they are captured from each new verified payment.</td></tr> : null}
            {(q.data?.actualFees ?? []).map((f) => (
              <tr key={f.purpose + f.currency}>
                <td>{f.purpose}</td><td>{f.count}</td><td>{formatMinor(f.amountMinor, f.currency)}</td>
                <td>{formatMinor(f.feeMinor, f.currency)}</td><td>{formatMinor(f.taxMinor, f.currency)}</td>
                <td>{f.amountMinor ? ((f.feeMinor / f.amountMinor) * 100).toFixed(2) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
