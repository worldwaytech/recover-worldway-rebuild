import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bookingOps, money, type Booking } from "@/lib/booking-ops";
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

export const Route = createFileRoute("/admin/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Worldway Admin" },
      { name: "description", content: "Review and manage all customer bookings." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Bookings — Worldway Admin" },
      { property: "og:description", content: "Review and manage all customer bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

const STATUSES = [
  "pending",
  "hold",
  "deposit-paid",
  "confirmed",
  "completed",
  "cancellation-requested",
] as const;

function BookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Booking[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(id: string, task: () => Promise<unknown>, message: string) {
    setBusy(id);
    try {
      await task();
      toast.success(message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That change could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  const confirmedRevenue = rows
    .filter((r) => r.status === "confirmed" || r.status === "completed")
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Operations</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Bookings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Live customer bookings. Cancelling keeps the full payment and message history for audit.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Total" value={String(rows.length)} />
        <StatTile
          label="Confirmed"
          value={String(rows.filter((r) => r.status === "confirmed").length)}
        />
        <StatTile label="On hold" value={String(rows.filter((r) => r.status === "hold").length)} />
        <StatTile label="Confirmed value" value={money(confirmedRevenue)} />
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Journey</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Travel date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading bookings…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No bookings yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                <TableCell>{b.title}</TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {b.product_type}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.travel_date ?? "—"}</TableCell>
                <TableCell>{money(Number(b.amount ?? 0), b.currency ?? "USD")}</TableCell>
                <TableCell>{money(Number(b.amount_paid ?? 0), b.currency ?? "USD")}</TableCell>
                <TableCell>
                  <select
                    value={b.status}
                    disabled={busy !== null || b.status === "cancelled"}
                    onChange={(e) =>
                      void run(
                        b.id,
                        () => bookingOps.setStatus(b, e.target.value),
                        "Status updated.",
                      )
                    }
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                  >
                    {[...new Set([b.status, ...STATUSES])].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  {b.status === "cancelled" ? (
                    <span className="text-xs text-muted-foreground">Cancelled</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          b.id,
                          () => bookingOps.cancel(b, "Cancelled by Worldway operations"),
                          "Booking cancelled — history preserved.",
                        )
                      }
                    >
                      {busy === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
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
