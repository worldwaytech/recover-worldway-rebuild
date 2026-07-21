import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent Portal | Worldway Luxe" },
      { name: "description", content: "Travel-advisor portal for accredited agents — commissions, bookings, marketing collateral and training." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
