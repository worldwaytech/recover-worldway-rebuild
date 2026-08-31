import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/all-journeys")({
  component: () => <Outlet />,
});
