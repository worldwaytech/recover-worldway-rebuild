import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { walletNav } from "./wallet.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/wallet/payments")({
  head: () => ({ meta: [{ title: "Payments | Wallet" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Ledger" title="Payments" intro="Deposits, milestone payments and final balances across every booking." nav={walletNav}>
      <EmptyState title="No payments yet" text="Payments will appear here once you confirm your first booking." />
    </PortalShell>
  ),
});
