import { useState } from "react";
import { TOP_ROUTES, ROUTE_GROUP_LABELS, type RouteGroup } from "@/lib/up17/routes";

const GROUPS: RouteGroup[] = ["domestic", "outbound", "international"];

export function TopRoutes({
  onPick,
}: {
  onPick: (origin: string, destination: string) => void;
}) {
  const [group, setGroup] = useState<RouteGroup>("domestic");
  const routes = TOP_ROUTES[group];

  return (
    <section className="mx-auto mt-14 max-w-6xl px-6 pb-20">
      <h2 className="text-[11px] uppercase tracking-[0.3em] text-primary">Recommended routes</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Ranked by demand across the network — tap any route to load live fares.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.25em] transition ${
              g === group
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {ROUTE_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      <ol className="mt-6 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {routes.map((r) => (
          <li key={`${group}-${r.rank}`}>
            <button
              type="button"
              onClick={() => onPick(r.origin, r.destination)}
              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-left transition hover:border-primary/60"
            >
              <span className="w-8 shrink-0 font-mono text-[11px] text-primary">#{r.rank}</span>
              <span className="text-xs text-foreground">
                {r.originCity} <span className="text-muted-foreground">({r.origin})</span> →{" "}
                {r.destinationCity} <span className="text-muted-foreground">({r.destination})</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
