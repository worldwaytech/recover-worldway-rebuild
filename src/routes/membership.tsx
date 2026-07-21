import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/membership")({
  head: () => ({
    meta: [
      { title: "Worldway Luxe Membership | Private Access" },
      { name: "description", content: "Private-access membership for the discerning traveller — global concierge, priority allocations and members-only journeys." },
      { property: "og:title", content: "Worldway Luxe Membership" },
      { property: "og:url", content: "/membership" },
    ],
    links: [{ rel: "canonical", href: "/membership" }],
  }),
  component: () => <Outlet />,
});
