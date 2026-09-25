import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/yachts")({
  head: () => ({
    meta: [
      { title: "Yachts — Worldway Admin" },
      { name: "description", content: "Yacht charters: catalogue, quote requests and bookings." },
      { property: "og:title", content: "Yachts — Worldway Admin" },
      { property: "og:description", content: "Yacht charters: catalogue, quote requests and bookings." },
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
      area="yachts"
      title="Yachts"
      description="Yacht charters: catalogue, quote requests and bookings."
      source="Yachts collection + quote requests"
      links={[
        { to: "/yachts", label: "Yachts page" },
      ]}
    />
  );
}
