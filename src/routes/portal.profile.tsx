import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/profile")({
  head: () => ({ meta: [{ title: "Profile | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: Profile,
});

function Profile() {
  return (
    <PortalShell eyebrow="Account" title="Profile" intro="Your personal identity used across bookings, documents and communications." nav={portalNav}>
      <form className="grid max-w-3xl gap-6 rounded-sm border border-border bg-card p-6 shadow-soft md:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {[
          { label: "First name", type: "text" },
          { label: "Last name", type: "text" },
          { label: "Email", type: "email" },
          { label: "Phone", type: "tel" },
          { label: "Passport number", type: "text" },
          { label: "Date of birth", type: "date" },
          { label: "Nationality", type: "text" },
          { label: "Frequent flyer numbers", type: "text" },
        ].map((f) => (
          <label key={f.label} className="grid gap-1 text-sm">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{f.label}</span>
            <input type={f.type} disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Enable Lovable Cloud" />
          </label>
        ))}
        <div className="md:col-span-2">
          <Button variant="gold" disabled>Save changes</Button>
        </div>
      </form>
    </PortalShell>
  );
}
