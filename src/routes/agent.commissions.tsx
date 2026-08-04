import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { agentNav } from "@/lib/portal-nav";

export const Route = createFileRoute("/agent/commissions")({
  head: () => ({ meta: [{ title: "Commissions | Agent Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Payouts" title="Commissions" intro="Real-time commission ledger and monthly payout schedule." nav={agentNav}>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Earned YTD", value: "$0" },
          { label: "Pending", value: "$0" },
          { label: "Paid last cycle", value: "$0" },
        ].map((k) => (
          <div key={k.label} className="rounded-sm border border-border bg-card p-6">
            <p className="eyebrow">{k.label}</p>
            <p className="mt-2 font-serif text-3xl">{k.value}</p>
          </div>
        ))}
      </div>
    </PortalShell>
  ),
});
