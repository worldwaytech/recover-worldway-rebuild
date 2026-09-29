import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";
import { AviationDesk } from "@/components/admin/aviation-desk";

export const Route = createFileRoute("/admin/ops/aviation")({
  head: () => ({
    meta: [
      { title: "Private Aviation & Empty Legs — Worldway Admin" },
      { name: "description", content: "Charter and empty-leg inquiries, aviation catalogue and bookings." },
      { property: "og:title", content: "Private Aviation & Empty Legs — Worldway Admin" },
      { property: "og:description", content: "Charter and empty-leg inquiries, aviation catalogue and bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <ProductOpsPanel
        area="aviation"
        title="Private Aviation & Empty Legs"
        description="Charter and empty-leg inquiries, aviation catalogue and bookings."
        source="Villiers MCP + RSS feed (private_aviation_requests) and legacy inquiry form (aviation_inquiries)"
        links={[
          { to: "/private-jets", label: "Private jets page" },
          { to: "/private-aviation/empty-legs", label: "Empty legs page" },
        ]}
      />
      <AviationDesk />
    </>
  );
}
