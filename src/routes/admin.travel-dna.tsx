import { createFileRoute } from "@tanstack/react-router";
import { StatTile } from "@/components/portal-shell";
import { useVerifiedRole } from "@/hooks/use-verified-role";
import { getTravelDnaOps } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, NotConfigured, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/travel-dna")({
  head: adminHead("Travel DNA & AI", "Consent status and AI operations — Super Admin only."),
  component: Page,
});

type D = Awaited<ReturnType<typeof getTravelDnaOps>>;

function Inner() {
  const q = useConsole<D>("dna", getTravelDnaOps);
  const d = q.data;
  return (
    <QueryState q={q}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Profiles" value={String(d?.rows.length ?? 0)} />
        <StatTile label="Consented" value={String(d?.rows.filter((r: any) => r.consented).length ?? 0)} />
        <StatTile label="Journey versions (30d)" value={String(d?.ai.versions30d ?? 0)} hint={`${d?.ai.explained30d ?? 0} with AI explanation`} />
        <StatTile label="Simulations (30d)" value={String(d?.ai.simulations30d ?? 0)} />
      </div>
      <Panel title="AI service">
        <div className="text-sm">Model: {d?.ai.model} · {d?.ai.gatewayConfigured ? "connected" : "not configured"}</div>
        <p className="mt-1 text-xs text-muted-foreground">AI only reads requests and phrases explanations; every explanation is checked against engine results before it is shown.</p>
      </Panel>
      <Panel title="Travel DNA profiles">
        <p className="mb-3 text-xs text-muted-foreground">Customers are shown by reference only. Preference contents are never shown here. Every view of this page is written to the audit log.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th>Reference</th><th>Consent</th><th>Consent changes</th><th>Preference fields</th><th>Updated</th></tr></thead>
          <tbody>
            {(d?.rows ?? []).map((r: any) => (
              <tr key={r.ref} className="border-t border-border/40"><td className="py-2">{r.ref}</td><td>{r.consented ? "Given" : "Not given"}</td><td>{r.consentChanges}</td><td>{r.preferenceFields}</td><td>{when(r.updatedAt)}</td></tr>
            ))}
          </tbody>
        </table>
        {!d?.rows.length && <Empty>No Travel DNA profiles yet.</Empty>}
      </Panel>
    </QueryState>
  );
}

function Page() {
  const v = useVerifiedRole(["super_admin"]);
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Intelligence" title="Travel DNA & AI Operations" />
      {v === "allowed" ? <Inner /> : v === "checking" ? <Empty>Checking access…</Empty> : <NotConfigured what="Super Admin access required" note="Customer preference data is limited to the Super Admin." />}
    </div>
  );
}
