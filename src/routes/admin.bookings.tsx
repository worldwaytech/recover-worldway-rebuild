import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { admin, type Booking } from "@/lib/admin-store";
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
import { Trash2 } from "lucide-react";

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

function BookingsPage() {
  const [tick, setTick] = useState(0);
  void tick;
  const rows = admin.bookings();
  const revenue = rows.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.total, 0);
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Operations</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Bookings</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Total" value={String(rows.length)} />
        <StatTile
          label="Confirmed"
          value={String(rows.filter((r) => r.status === "confirmed").length)}
        />
        <StatTile label="On hold" value={String(rows.filter((r) => r.status === "hold").length)} />
        <StatTile label="Revenue" value={`$${revenue.toLocaleString()}`} />
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
              <TableHead>Type</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.ref}</TableCell>
                <TableCell>{b.client}</TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {b.type}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.route}</TableCell>
                <TableCell>${b.total.toLocaleString()}</TableCell>
                <TableCell>
                  <select
                    value={b.status}
                    onChange={(e) => {
                      admin.updateBookingStatus(b.id, e.target.value as Booking["status"]);
                      setTick((t) => t + 1);
                    }}
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                  >
                    {(["pending", "hold", "confirmed", "cancelled"] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{b.agent}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      admin.removeBooking(b.id);
                      setTick((t) => t + 1);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
