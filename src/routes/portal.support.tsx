import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { Button } from "@/components/ui/button";
import { FAQGroup } from "@/components/enterprise";

export const Route = createFileRoute("/portal/support")({
  head: () => ({ meta: [{ title: "Support centre | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Help" title="Support centre" intro="Reach your dedicated specialist or our 24/7 travel desk anywhere in the world." nav={portalNav}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <FAQGroup items={[
          { q: "How do I amend a booking?", a: "Message your specialist directly from the booking or call the 24/7 desk. Most amendments up to 14 days before departure are complimentary." },
          { q: "What is Worldway's cancellation policy?", a: "Standard bookings follow supplier terms. Members enjoy enhanced flexibility on selected suppliers — see your membership benefits page." },
          { q: "How do I make an emergency request while travelling?", a: "Tap Concierge chat on any device, or call the number printed on your travel wallet card." },
        ]} />
        <div className="rounded-sm border border-border bg-card p-6">
          <p className="font-serif text-2xl">Talk to us</p>
          <p className="mt-2 text-sm text-muted-foreground">24/7 in-country support in 12 languages.</p>
          <Link to="/contact" className="mt-4 inline-block"><Button variant="gold">Contact concierge</Button></Link>
        </div>
      </div>
    </PortalShell>
  ),
});
