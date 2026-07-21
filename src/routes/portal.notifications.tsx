import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";

const items = [
  { title: "Welcome to Worldway Luxe", when: "Today", text: "Your account is ready. Complete your profile to receive tailored proposals." },
  { title: "Concierge assigned", when: "In minutes", text: "A specialist is preparing your welcome pack — expect a message shortly.", muted: true },
];

export const Route = createFileRoute("/portal/notifications")({
  head: () => ({ meta: [{ title: "Notifications | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Inbox" title="Notifications" intro="Departure alerts, itinerary changes, quotes ready to review and messages from your specialist." nav={portalNav}>
      <ul className="divide-y divide-border rounded-sm border border-border bg-card">
        {items.map((i) => (
          <li key={i.title} className="flex items-start justify-between gap-6 p-5">
            <div>
              <p className="font-serif text-lg">{i.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
            </div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{i.when}</span>
          </li>
        ))}
      </ul>
    </PortalShell>
  ),
});
