import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/safari")({
  head: () => ({
    meta: [
      { title: "Safari — Worldway Admin" },
      { name: "description", content: "Safari journeys: catalogue, quote requests and bookings." },
      { property: "og:title", content: "Safari — Worldway Admin" },
      { property: "og:description", content: "Safari journeys: catalogue, quote requests and bookings." },
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
      area="safari"
      title="Safari"
      description="Safari journeys: catalogue, quote requests and bookings."
      source="Safari collection + quote requests"
      links={[
        { to: "/safari", label: "Safari page" },
      ]}
    />
  );
}
