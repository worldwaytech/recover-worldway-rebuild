import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "./admin.index";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Access" title="Users & roles" intro="Grant admin, agent or partner roles. All checks flow through the has_role RLS helper." nav={adminNav}>
      <div className="rounded-sm border border-border bg-card p-6 text-sm text-muted-foreground">
        User directory will populate once Lovable Cloud auth is enabled.
      </div>
    </PortalShell>
  ),
});
