import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "./agent";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Receipt } from "lucide-react";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet | Worldway Luxe" },
      { name: "description", content: "Manage deposits, payments, refunds and store credit in your Worldway wallet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PortalShell
      eyebrow="Payments"
      title="Wallet"
      intro="Deposits, payments, invoices, refunds and store credit — a single ledger across every booking."
      tiles={[
        { icon: WalletIcon, title: "Available balance", text: "Store credit and pre-paid balances across currencies." },
        { icon: ArrowUpRight, title: "Payments", text: "Deposits, milestone payments and final balances on schedule." },
        { icon: ArrowDownLeft, title: "Refunds", text: "Real-time status of refunds, credits and insurance reimbursements." },
        { icon: Receipt, title: "Invoices & receipts", text: "Download PDF invoices and payment receipts for every booking." },
      ]}
    />
  ),
});
