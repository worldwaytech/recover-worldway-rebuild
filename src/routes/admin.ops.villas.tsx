import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/villas")({
  head: () => ({
    meta: [
      { title: "Villas — Worldway Admin" },
      { name: "description", content: "Private villas: catalogue, quote requests and bookings." },
      { property: "og:title", content: "Villas — Worldway Admin" },
      { property: "og:description", content: "Private villas: catalogue, quote requests and bookings." },
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
      area="villas"
      title="Villas"
      description="Private villas: catalogue, quote requests and bookings."
      source="Villas collection + quote requests"
      links={[
        { to: "/villas", label: "Villas page" },
      ]}
    />
  );
}
