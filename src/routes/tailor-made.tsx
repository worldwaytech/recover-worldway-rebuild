import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tailor-made")({
  component: () => <Outlet />,
});
