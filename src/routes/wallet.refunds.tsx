import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { walletNav } from "./wallet.index";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/wallet/refunds")({
  head: () => ({ meta: [{ title: "Refunds | Wallet" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Reimbursement" title="Refunds" intro="Track refund status in real time and open a new refund request." nav={walletNav}>
      <div className="rounded-sm border border-border bg-card p-6">
        <p className="font-serif text-xl">Open a refund request</p>
        <p className="mt-1 text-sm text-muted-foreground">Refunds are processed via the original payment method within 5–10 business days once approved.</p>
        <div className="mt-4 flex gap-3">
          <Link to="/contact"><Button variant="gold">Request refund</Button></Link>
          <Link to="/wallet/invoices"><Button variant="outline-ink">View invoices</Button></Link>
        </div>
      </div>
    </PortalShell>
  ),
});
