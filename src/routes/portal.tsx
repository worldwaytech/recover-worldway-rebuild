import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Guest Portal | Worldway Luxe" },
      { name: "description", content: "Manage your journeys, documents, itineraries and preferences in the Worldway guest portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
