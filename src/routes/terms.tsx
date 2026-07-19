import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "./privacy";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | Worldway Luxe" },
      { name: "description", content: "Terms and conditions for booking with Worldway Luxe." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: () => (
    <LegalPage title="Terms & Conditions">
      <p>These terms govern your use of the Worldway Luxe website and any journeys booked through us.</p>
      <p>All journeys are subject to availability and confirmation. Prices are indicative and confirmed at time of booking. Deposits and cancellation terms are notified before you commit.</p>
      <p>Worldway Luxe acts as agent for the various suppliers whose services form part of your journey. Full booking terms are issued with every confirmation.</p>
    </LegalPage>
  ),
});
