import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHead, Panel, NotConfigured, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/settings")({
  head: adminHead("Settings", "Platform configuration status."),
  component: () => (
    <div className="space-y-6">
      <PageHead eyebrow="Configuration" title="Platform settings" />
      <Panel title="Current configuration">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Brand</dt><dd>Worldway Travels Group</dd></div>
          <div><dt className="text-xs text-muted-foreground">Currency conversion</dt><dd><Link to="/admin/pricing" className="text-primary underline">See Pricing & FX</Link></dd></div>
          <div><dt className="text-xs text-muted-foreground">Supplier controls</dt><dd><Link to="/admin/integrations" className="text-primary underline">API & Sync Center</Link></dd></div>
          <div><dt className="text-xs text-muted-foreground">Roles</dt><dd><Link to="/admin/users" className="text-primary underline">Users</Link></dd></div>
        </dl>
      </Panel>
      <NotConfigured what="Editable platform settings (support email, default currency, maintenance mode)" note="These are not stored on the server yet, so they can't be changed here." />
    </div>
  ),
});
