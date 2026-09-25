import { createFileRoute } from "@tanstack/react-router";
import { ProductOpsPanel } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/ops/trip-services")({
  head: () => ({
    meta: [
      { title: "TripJack Cabs & TripSafe — Worldway Admin" },
      { name: "description", content: "Cab and travel-insurance operations. Certification evidence stays on the TripJack certification page." },
      { property: "og:title", content: "TripJack Cabs & TripSafe — Worldway Admin" },
      { property: "og:description", content: "Cab and travel-insurance operations. Certification evidence stays on the TripJack certification page." },
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
      area="trip-services"
      title="TripJack Cabs & TripSafe"
      description="Cab and travel-insurance operations. Certification evidence stays on the TripJack certification page."
      source="TripJack UAT logs, certification cases, bookings"
      links={[
        { to: "/admin/tripjack", label: "TripJack certification" },
        { to: "/trip/cabservices", label: "Cab services page" },
        { to: "/trip/tripsafeservices", label: "TripSafe page" },
      ]}
    />
  );
}
