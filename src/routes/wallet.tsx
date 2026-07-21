import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet | Worldway Luxe" },
      { name: "description", content: "Manage deposits, payments, refunds and store credit in your Worldway wallet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
