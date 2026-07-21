import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { walletNav } from "./wallet.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/wallet/invoices")({
  head: () => ({ meta: [{ title: "Invoices | Wallet" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Documents" title="Invoices & receipts" intro="Download PDF invoices and payment receipts for every booking." nav={walletNav}>
      <EmptyState title="No invoices yet" text="Invoices are issued the moment a deposit is captured." />
    </PortalShell>
  ),
});
