import { createFileRoute } from "@tanstack/react-router";
import { PageHead, NotConfigured, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/content")({
  head: adminHead("Content & Flags", "Platform content and feature flag status."),
  component: () => (
    <div className="space-y-6">
      <PageHead eyebrow="Platform" title="Content & Feature Flags" />
      <NotConfigured
        what="Feature flags"
        note="No server-side feature flags exist yet. Supplier on/off switches and live-booking controls are managed in the API & Sync Center, where every change is audited."
      />
      <NotConfigured what="Content management" note="Page content is part of the site itself; there is no editable content store yet." />
    </div>
  ),
});
