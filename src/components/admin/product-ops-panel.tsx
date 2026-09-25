import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getProductOps, type ProductArea } from "@/lib/admin/product-ops.functions";

export function DataTable({ rows }: { rows: Record<string, string | number | boolean | null>[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No records yet.</p>;
  const cols = Object.keys(rows[0]!);
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="px-3 py-2 font-medium">{c.replace(/_/g, " ")}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-foreground">
                  {r[c] === null || r[c] === undefined ? "—" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl text-foreground">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export type OpsLink = { to: string; label: string };

export function ProductOpsPanel({
  area,
  title,
  description,
  source,
  links,
}: {
  area: ProductArea;
  title: string;
  description: string;
  source: string;
  links: OpsLink[];
}) {
  const fetchOps = useServerFn(getProductOps);
  const q = useQuery({ queryKey: ["admin-product-ops", area], queryFn: () => fetchOps({ data: { area } }) });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          <p className="mt-1 text-xs text-muted-foreground">Data source: {source}</p>
        </div>
        <button onClick={() => q.refetch()} className="rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:text-primary">
            {l.label} →
          </Link>
        ))}
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {q.data.catalogue.map((c) => (
              <Stat key={c.collection} label={`Catalogue · ${c.collection}`} value={c.items} note="Published items" />
            ))}
            {q.data.sections.map((s) => (
              <Stat key={s.title} label={s.title} value={s.count ?? "—"} {...(s.note ? { note: s.note } : {})} />
            ))}
          </div>
          {q.data.providers.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">Registered connectors</h2>
              <DataTable rows={q.data.providers} />
            </section>
          )}
          {q.data.sections.filter((s) => s.rows.length).map((s) => (
            <section key={s.title} className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">Recent · {s.title}</h2>
              <DataTable rows={s.rows} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
