import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { accountApi } from "@/lib/account-data";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";

export const Route = createFileRoute("/account/bookings")({
  head: () => ({
    meta: [
      { title: "My bookings — Worldway Travels Group" },
      {
        name: "description",
        content: "Every Worldway booking: flights, hotels, jets, transfers and experiences.",
      },
      { property: "og:title", content: "My bookings — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Every Worldway booking: flights, hotels, jets, transfers and experiences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bookings,
});

const FILTERS = ["all", "upcoming", "past"] as const;

function Bookings() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["account", "bookings"],
    queryFn: accountApi.bookings,
  });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const rows = data.filter((b) => {
    if (filter === "all") return true;
    if (!b.travel_date) return filter === "upcoming";
    const future = new Date(b.travel_date).getTime() >= Date.now();
    return filter === "upcoming" ? future : !future;
  });

  return (
    <Panel
      title="Bookings"
      description="Confirmations issued by Worldway and our supply partners."
      actions={
        <div className="flex gap-1 rounded-full border border-border/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-widest transition ${
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <EmptyState title="Loading bookings…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No bookings here yet"
          hint="Search flights, hotels or jets and your confirmations will appear in this list."
        />
      ) : (
        <Rows>
          {rows.map((b) => (
            <Row
              key={b.id}
              title={
                <Link
                  to="/account/booking/$id"
                  params={{ id: b.id }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {b.title}
                </Link>
              }
              meta={`${b.product_type} · ref ${b.reference} · ${fmtDate(b.travel_date)}${b.supplier ? ` · ${b.supplier}` : ""}`}
              right={
                <div className="text-right">
                  <div className="text-sm text-primary">
                    {b.amount != null ? `${b.currency} ${Number(b.amount).toLocaleString()}` : "—"}
                  </div>
                  <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    {b.status}
                  </div>
                </div>
              }
            />
          ))}
        </Rows>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Need a change?{" "}
        <Link to="/concierge" className="text-primary underline-offset-4 hover:underline">
          Ask the concierge
        </Link>
        .
      </p>
    </Panel>
  );
}
