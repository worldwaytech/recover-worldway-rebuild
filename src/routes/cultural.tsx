import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cultural")({
  component: () => <Outlet />,
});
