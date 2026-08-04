import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/world-cruises")({
  component: () => <Outlet />,
});
