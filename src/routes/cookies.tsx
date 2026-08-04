import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero, ContentBody, Clause, LEGAL_UPDATED } from "@/components/content-page";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Which cookies and local storage Worldway Travels Group uses for sign-in, search state and analytics, and how to control them.",
      },
      { property: "og:title", content: "Cookie Policy — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Cookies and local storage we use for sign-in, search state and analytics, and how to control them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CookiesPage,
});

const TABLE = [
  {
    name: "Authentication session",
    type: "Strictly necessary",
    purpose: "Keeps you signed in and authorises requests to your account, wallet and bookings.",
    life: "Until sign-out or expiry",
  },
  {
    name: "Search & form state",
    type: "Functional",
    purpose: "Remembers recent search inputs so results survive navigation and reloads.",
    life: "Session",
  },
  {
    name: "Preferences",
    type: "Functional",
    purpose: "Stores display preferences such as currency and notification settings.",
    life: "12 months",
  },
  {
    name: "Analytics",
    type: "Analytics",
    purpose: "Aggregated page and performance measurement to improve the platform.",
    life: "Up to 24 months",
  },
];

function CookiesPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Legal"
        title="Cookie Policy"
        subtitle={`Last updated ${LEGAL_UPDATED}`}
      />
      <ContentBody>
        <Clause heading="What we use">
          <p>
            We use cookies and browser local storage to keep you signed in, preserve search state
            and measure performance. We do not sell data collected through cookies.
          </p>
        </Clause>
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-sm">
            <thead className="bg-card/60 text-xs uppercase tracking-[0.2em] text-primary">
              <tr>
                <th className="p-3">Cookie</th>
                <th className="p-3">Type</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Lifetime</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map((r) => (
                <tr key={r.name} className="border-t border-border/60">
                  <td className="p-3 text-foreground">{r.name}</td>
                  <td className="p-3">{r.type}</td>
                  <td className="p-3">{r.purpose}</td>
                  <td className="p-3">{r.life}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Clause heading="Managing cookies">
          <p>
            You can clear or block cookies in your browser settings. Blocking strictly necessary
            cookies will prevent sign-in, bookings and wallet access from working.
          </p>
        </Clause>
        <Clause heading="More information">
          <p>
            See our{" "}
            <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">
              Privacy Policy
            </Link>{" "}
            for how personal data is handled.
          </p>
        </Clause>
      </ContentBody>
    </PageShell>
  );
}
