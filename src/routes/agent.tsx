import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutDashboard, Users, Wallet, FileText, LineChart, Settings } from "lucide-react";

// TODO(Lovable Cloud): all portals below require authenticated Supabase
// sessions. When Cloud is enabled, wrap each under /_authenticated with a
// requireSupabaseAuth loader and a has_role check for admin/agent surfaces.

function PortalShell({ title, eyebrow, intro, tiles }: {
  title: string; eyebrow: string; intro: string;
  tiles: { icon: React.ElementType; title: string; text: string }[];
}) {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-5xl md:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{intro}</p>
        <div className="mt-4 inline-flex rounded-sm border border-dashed border-gold/50 bg-gold/5 px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-gold">
          TODO(Lovable Cloud) · activates with backend
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.title} className="rounded-sm border border-border bg-card p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gold/15 text-gold">
                <t.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-serif text-xl">{t.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link to="/" className="text-xs uppercase tracking-widest text-gold">← Back to Worldway Luxe</Link>
        </div>
      </section>
    </main>
  );
}

export { PortalShell };

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent Portal | Worldway Luxe" },
      { name: "description", content: "Travel-advisor portal for accredited agents — commissions, bookings, marketing collateral and training." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PortalShell
      eyebrow="For accredited agents"
      title="Agent Portal"
      intro="Bookings, commissions, marketing collateral, training and preferred-partner benefits."
      tiles={[
        { icon: LayoutDashboard, title: "Bookings dashboard", text: "Active bookings, upcoming departures and quote pipeline in one view." },
        { icon: Wallet, title: "Commissions & payouts", text: "Real-time commission ledger with monthly payout scheduling." },
        { icon: FileText, title: "Collateral library", text: "Brochures, itineraries and co-branded assets ready to send." },
        { icon: Users, title: "Client CRM", text: "Passenger profiles, passport data and travel history secured." },
        { icon: LineChart, title: "Performance", text: "Year-over-year sales, mix and pipeline analytics." },
        { icon: Settings, title: "Preferences", text: "Notification, calendar and payout preferences." },
      ]}
    />
  ),
});
