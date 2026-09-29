import { createFileRoute } from "@tanstack/react-router";
import { getPricingConsole } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/pricing")({
  head: adminHead("Pricing & FX", "Read-only markup, commission and currency-conversion rules."),
  component: PricingPage,
});

type P = { rules: any[]; fx: { provider: string; configured: boolean; cacheMinutes: number; staleAfterHours: number }; audit: any[] };

function PricingPage() {
  const q = useConsole<P>("pricing", getPricingConsole);
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Commercial" title="Pricing & FX" intro="Read-only. Rules live on the server; a supplier without a rule cannot be priced or booked." />
      <QueryState q={q}>
        <Panel title="Markup and commission rules">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th>Supplier</th><th>Markup</th><th>Commission</th><th>Applied to</th><th>Source</th><th>Effective</th></tr></thead>
            <tbody>
              {(d?.rules ?? []).map((r) => (
                <tr key={r.supplierKey} className="border-t border-border/40">
                  <td className="py-2">{r.supplierKey}</td>
                  <td>{r.markupPercent == null ? <span className="text-muted-foreground">Not configured</span> : `${r.markupPercent}%`}</td>
                  <td>{r.commissionPercent == null ? "—" : `${r.commissionPercent}%`}</td>
                  <td>{r.basis ?? "—"}</td><td>{r.source ?? "—"}</td><td>{r.effective ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Currency conversion">
          <div className="text-sm">Provider: {d?.fx.provider}</div>
          <div className={`mt-1 text-sm ${d?.fx.configured ? "text-primary" : "text-destructive"}`}>{d?.fx.configured ? "Configured — live rates active" : "Not configured — prices stay in the supplier's currency"}</div>
          <p className="mt-1 text-xs text-muted-foreground">Rates cached {d?.fx.cacheMinutes} min; rates older than {d?.fx.staleAfterHours} h are refused.</p>
        </Panel>
        <Panel title="Pricing audit trail">
          <ul className="space-y-1 text-sm">
            {(d?.audit ?? []).map((a, i) => <li key={i}>{when(a.created_at)} · {a.action} · {a.actor_email ?? "system"}</li>)}
          </ul>
          {!d?.audit?.length && <Empty>No pricing changes recorded. Current rules were set in server configuration.</Empty>}
        </Panel>
      </QueryState>
    </div>
  );
}
