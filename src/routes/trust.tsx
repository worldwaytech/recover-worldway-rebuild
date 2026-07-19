import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "./privacy";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Safety | Worldway Luxe" },
      { name: "description", content: "How Worldway Luxe protects your booking, data and journey." },
      { property: "og:url", content: "/trust" },
    ],
    links: [{ rel: "canonical", href: "/trust" }],
  }),
  component: () => (
    <LegalPage title="Trust & Safety">
      <p>Every Worldway Luxe journey is backed by 24/7 concierge support, comprehensive supplier vetting and full financial protection.</p>
      <p>We partner only with suppliers that meet our safety and service standards, and every itinerary is monitored end-to-end by a dedicated specialist.</p>
    </LegalPage>
  ),
});
