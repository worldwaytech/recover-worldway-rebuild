import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "@/components/portal-shell";
import { listPaymentLedger, type PaymentLedgerRow } from "@/lib/admin/oversight.functions";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Worldway Travels Group" }] }),
  component: PaymentsPage,
});

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function PaymentsPage() {
  const load = useServerFn(listPaymentLedger);
  const [rows, setRows] = useState<PaymentLedgerRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    void (async () => {
      try {
        const out = await load({ data: {} });
        setRows(out.rows);
        setState("ready");
      } catch {
        setState("denied");
      }
    })();
  }, [load]);

  const settled = rows
    .filter((p) => ["captured", "paid", "succeeded", "settled"].includes(p.status.toLowerCase()))
    .reduce((s, p) => s + p.amount, 0);
  const refunded = rows
    .filter((p) => p.status.toLowerCase().includes("refund"))
    .reduce((s, p) => s + p.amount, 0);
  const currency = rows[0]?.currency ?? "USD";

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Finance</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Payments</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Live record of booking payments and gateway transactions. Refunds are issued through the
          payment provider and reconciled here — they are never initiated from this screen.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Settled" value={money(settled, currency)} />
        <StatTile label="Refunded" value={money(refunded, currency)} />
        <StatTile label="Transactions" value={String(rows.length)} />
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recorded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={`${p.source}-${p.id}`}>
                <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                <TableCell className="font-mono text-xs">{p.bookingReference ?? "—"}</TableCell>
                <TableCell>{money(p.amount, p.currency)}</TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {p.method}
                </TableCell>
                <TableCell>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
                    {p.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {state !== "loading" && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  {state === "denied"
                    ? "You do not have permission to view payments."
                    : "No payments recorded yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
