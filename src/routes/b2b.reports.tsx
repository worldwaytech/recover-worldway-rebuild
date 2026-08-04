import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/b2b/reports")({
  head: () => ({
    meta: [
      { title: "Travel Reports — Worldway" },
      { name: "description", content: "Spend and compliance reporting for corporate travel." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Travel Reports — Worldway" },
      {
        property: "og:description",
        content: "Spend and compliance reporting for corporate travel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

function Reports() {
  const rows = [
    { m: "Air", v: "$92,400", s: "+8%", up: true },
    { m: "Hotel", v: "$61,220", s: "+3%", up: true },
    { m: "Ground", v: "$14,800", s: "-2%", up: false },
    { m: "Other", v: "$18,000", s: "+11%", up: true },
  ];
  const total = rows.reduce((s, r) => s + Number(r.v.replace(/[^0-9.]/g, "")), 0);
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Finance</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Reports</h1>
        <p className="text-sm text-muted-foreground">Month-to-date spend by category.</p>
      </div>
      <div
        className="rounded-3xl border border-primary/30 bg-card/60 p-8"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
          MTD total spend
        </div>
        <div className="mt-3 font-serif text-5xl text-primary">${total.toLocaleString()}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.m} className="rounded-2xl border border-border/60 bg-card/60 p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
              {r.m}
            </div>
            <div className="mt-2 font-serif text-3xl text-primary">{r.v}</div>
            <div
              className={`mt-2 inline-flex items-center gap-1 text-xs ${r.up ? "text-primary" : "text-destructive"}`}
            >
              {r.up ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}{" "}
              {r.s} vs last month
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
