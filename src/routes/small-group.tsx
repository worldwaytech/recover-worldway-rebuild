import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/small-group")({
  component: () => <Outlet />,
});
