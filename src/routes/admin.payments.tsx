import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { admin } from "@/lib/admin-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/portal-shell";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Worldway Travels Group" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const [tick, setTick] = useState(0);
  void tick;
  const rows = admin.payments();
  const captured = rows.filter((p) => p.status === "captured").reduce((s, p) => s + p.amount, 0);
  const refunded = rows.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount, 0);
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Finance</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Payments</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Captured" value={`$${captured.toLocaleString()}`} />
        <StatTile label="Refunded" value={`$${refunded.toLocaleString()}`} />
        <StatTile label="Transactions" value={String(rows.length)} />
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Gateway</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                <TableCell>{p.client}</TableCell>
                <TableCell>
                  ${p.amount.toLocaleString()} {p.currency}
                </TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {p.gateway}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] ${p.status === "captured" ? "border-primary/40 text-primary" : p.status === "refunded" ? "border-destructive/40 text-destructive" : "border-border/60 text-muted-foreground"}`}
                  >
                    {p.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {p.status === "captured" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        admin.refundPayment(p.id);
                        setTick((t) => t + 1);
                      }}
                    >
                      Refund
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
