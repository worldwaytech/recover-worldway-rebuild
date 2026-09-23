import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { TransferFlow } from "@/components/transfers/transfer-flow";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Transfers — Worldway Travels Group" },
      { name: "description", content: "Private and shared airport, port, station and hotel transfers with live prices and instant confirmation." },
      { property: "og:title", content: "Transfers — Worldway Travels Group" },
      { property: "og:description", content: "Live private and shared transfers between airports, ports, stations and hotels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  const match = useMatchRoute();
  if (match({ to: "/transfers/voucher/$reference", fuzzy: true })) return <Outlet />;
  return (
    <PageShell>
      <PageHero
        eyebrow="Transfers"
        title="Kerb to cabin, seamlessly."
        subtitle="Private and shared transfers between airports, ports, stations and hotels — live prices, instant confirmation."
        image="https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=2000&q=80"
      />
      <TransferFlow />
    </PageShell>
  );
}
