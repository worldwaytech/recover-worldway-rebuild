import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin | Worldway Luxe" },
      { name: "description", content: "Administrator console for Worldway Luxe operations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
