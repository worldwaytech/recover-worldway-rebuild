import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/rail")({
  head: () => ({
    meta: [
      { title: "Rail — Worldway Admin" },
      { name: "description", content: "Luxury rail journeys: catalogue, quote requests and bookings." },
      { property: "og:title", content: "Rail — Worldway Admin" },
      { property: "og:description", content: "Luxury rail journeys: catalogue, quote requests and bookings." },
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
      area="rail"
      title="Rail"
      description="Luxury rail journeys: catalogue, quote requests and bookings."
      source="Rail collection + quote requests"
      links={[
        { to: "/rail", label: "Rail page" },
      ]}
    />
  );
}
