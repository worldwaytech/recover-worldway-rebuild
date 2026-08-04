import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";

export const Route = createFileRoute("/crystal-cruises")({
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
});
