import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/expedition-cruises")({
  component: () => <Outlet />,
});
