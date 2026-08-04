import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero, ContentBody, Clause } from "@/components/content-page";
import { Globe2, ShieldCheck, Clock, Plane } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Worldway Travels Group — Luxury Travel Company" },
      {
        name: "description",
        content:
          "Worldway Travels Group is a global luxury travel company delivering flights, hotels, private aviation, transfers and bespoke journeys with 24/7 concierge care.",
      },
      { property: "og:title", content: "About Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "A global luxury travel company delivering flights, hotels, private aviation and bespoke journeys with 24/7 concierge care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

const STATS = [
  { icon: <Globe2 className="h-5 w-5" />, value: "190+", label: "Countries served" },
  { icon: <Plane className="h-5 w-5" />, value: "900+", label: "Airline & supplier partners" },
  { icon: <Clock className="h-5 w-5" />, value: "24/7", label: "Concierge availability" },
  { icon: <ShieldCheck className="h-5 w-5" />, value: "100%", label: "Verified inventory" },
];

function AboutPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Our house"
        title="Travel, engineered around the traveller."
        subtitle="Worldway Travels Group combines a global supply network with an AI concierge and human specialists, so every journey is booked once and cared for end to end."
      />
      <div className="mx-auto grid max-w-5xl gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card/60 p-5">
            <div className="text-primary">{s.icon}</div>
            <div className="mt-3 font-serif text-2xl text-foreground">{s.value}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <ContentBody>
        <Clause heading="Who we are">
          <p>
            Worldway Travels Group is a full-service travel company operating across leisure,
            corporate and private aviation. We aggregate live supplier inventory — scheduled and
            fixed-departure flights, hotels and residences, ground transfers, coaches, activities
            and private charter — into a single booking and servicing platform.
          </p>
        </Clause>
        <Clause heading="How we work">
          <p>
            Every search on this platform queries live supplier systems in real time. We do not
            publish estimated or illustrative inventory: if a supplier cannot return availability,
            we say so rather than show a placeholder fare.
          </p>
          <p>
            Members reach specialists through the AI Concierge, which is connected to the same
            inventory, wallet and booking records as our operations team.
          </p>
        </Clause>
        <Clause heading="Who we serve">
          <p>
            Individual travellers and members, corporate travel programmes through our{" "}
            <Link to="/b2b" className="text-primary underline-offset-4 hover:underline">
              corporate portal
            </Link>
            , and accredited travel agents through our{" "}
            <Link to="/agent" className="text-primary underline-offset-4 hover:underline">
              agent programme
            </Link>
            .
          </p>
        </Clause>
        <Clause heading="Talk to us">
          <p>
            Reach the concierge desk any time via{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              our contact desk
            </Link>{" "}
            or read our{" "}
            <Link to="/trust" className="text-primary underline-offset-4 hover:underline">
              trust and safety commitments
            </Link>
            .
          </p>
        </Clause>
      </ContentBody>
    </PageShell>
  );
}
