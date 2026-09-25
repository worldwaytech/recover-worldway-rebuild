import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/cruisea")({
  head: () => ({
    meta: [
      { title: "Cruisea & General Cruises — Worldway Admin" },
      { name: "description", content: "Cruisea sailings and bookings plus ocean, river, expedition and world-cruise catalogues. Crystal has its own console." },
      { property: "og:title", content: "Cruisea & General Cruises — Worldway Admin" },
      { property: "og:description", content: "Cruisea sailings and bookings plus ocean, river, expedition and world-cruise catalogues. Crystal has its own console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ProductOpsPanel
      area="cruisea"
      title="Cruisea & General Cruises"
      description="Cruisea sailings and bookings plus ocean, river, expedition and world-cruise catalogues. Crystal has its own console."
      source="Cruisea tables + cruise collections"
      links={[
        { to: "/voyages/cruisea", label: "Cruisea search" },
        { to: "/cruises", label: "Cruises page" },
        { to: "/admin/crystal", label: "Crystal console" },
      ]}
    />
  );
}
