import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/destinations/$region/$country")({
  component: () => <Outlet />,
});
