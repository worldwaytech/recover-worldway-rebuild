import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/security")({
  head: () => ({ meta: [{ title: "Security | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Account safety" title="Security" intro="Password, multi-factor authentication and active session control." nav={portalNav}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-sm border border-border bg-card p-6">
          <p className="font-serif text-xl">Password</p>
          <p className="mt-1 text-sm text-muted-foreground">Rotate every 90 days for maximum security.</p>
          <Button className="mt-4" variant="gold" disabled>Change password</Button>
        </div>
        <div className="rounded-sm border border-border bg-card p-6">
          <p className="font-serif text-xl">Two-factor authentication</p>
          <p className="mt-1 text-sm text-muted-foreground">Add TOTP or SMS as a second factor.</p>
          <Button className="mt-4" variant="gold" disabled>Enable MFA</Button>
        </div>
        <div className="rounded-sm border border-border bg-card p-6 md:col-span-2">
          <p className="font-serif text-xl">Active sessions</p>
          <p className="mt-1 text-sm text-muted-foreground">See where you're signed in and sign out remotely.</p>
          <Button className="mt-4" variant="outline-ink" disabled>Sign out all devices</Button>
        </div>
      </div>
    </PortalShell>
  ),
});
