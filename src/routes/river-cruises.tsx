import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/river-cruises")({
  component: () => <Outlet />,
});
