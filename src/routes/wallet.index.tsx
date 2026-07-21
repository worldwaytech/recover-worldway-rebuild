import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Receipt, Ticket, RefreshCw } from "lucide-react";

const walletNav = [
  { label: "Overview", to: "/wallet", exact: true },
  { label: "Payments", to: "/wallet/payments" },
  { label: "Invoices", to: "/wallet/invoices" },
  { label: "Refunds", to: "/wallet/refunds" },
];

export const Route = createFileRoute("/wallet/")({
  head: () => ({ meta: [{ title: "Wallet | Worldway Luxe" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell
      eyebrow="Payments"
      title="Wallet"
      intro="Deposits, payments, invoices, refunds and store credit — a single ledger across every booking."
      nav={walletNav}
      tiles={[
        { icon: WalletIcon, title: "Available balance", text: "Store credit across all currencies." },
        { icon: ArrowUpRight, title: "Payments", text: "Deposits and milestone payments.", to: "/wallet/payments" },
        { icon: ArrowDownLeft, title: "Refunds", text: "Real-time refund status.", to: "/wallet/refunds" },
        { icon: Receipt, title: "Invoices", text: "PDF invoices for every booking.", to: "/wallet/invoices" },
        { icon: Ticket, title: "Coupons", text: "Active promotions and gift cards." },
        { icon: RefreshCw, title: "Installments", text: "Deposit / balance / final payment schedule." },
      ]}
    />
  ),
});

export { walletNav };
