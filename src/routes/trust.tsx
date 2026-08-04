import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero, ContentBody, Clause } from "@/components/content-page";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust, Safety & Security — Worldway Travels Group" },
      {
        name: "description",
        content:
          "How Worldway Travels Group protects payments, personal data and travellers: live-only inventory, encrypted payments, RBAC, KYC and 24/7 duty of care.",
      },
      { property: "og:title", content: "Trust, Safety & Security at Worldway" },
      {
        property: "og:description",
        content:
          "Live-only inventory, encrypted payments, strict access control, KYC and 24/7 duty of care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Trust & safety"
        title="Commitments we can be held to."
        subtitle="What we promise about inventory, money, data and duty of care — and how each promise is enforced."
      />
      <ContentBody>
        <Clause heading="Live-only inventory">
          <p>
            Every fare, rate and quote shown here originates from a live supplier response at the
            moment you search. We do not generate illustrative, cached-as-live or placeholder
            inventory. When a supplier is unavailable, the platform reports the failure instead of
            substituting content.
          </p>
        </Clause>
        <Clause heading="Payments">
          <p>
            Card and wallet payments are processed by regulated payment providers over TLS. Card
            numbers are never stored on Worldway infrastructure. Wallet top-ups are verified
            server-side against the provider before a balance is credited, and every movement is
            written to an immutable ledger.
          </p>
        </Clause>
        <Clause heading="Access control">
          <p>
            Accounts are role-based. Customer, agent, corporate, admin and super-admin capabilities
            are separated, roles are stored server-side in a dedicated table, and every privileged
            action is verified on the server — never from browser state. Row-level security scopes
            each record to its owner.
          </p>
        </Clause>
        <Clause heading="Identity & compliance">
          <p>
            Agents, corporate accounts and high-value transactions pass KYC review before
            activation. Verification documents are stored with restricted access and retained only
            as long as regulation requires.
          </p>
        </Clause>
        <Clause heading="Duty of care">
          <p>
            Travellers in trip reach a specialist at any hour. Disruption alerts, rebooking support
            and medical or security escalation are handled by the same desk that made the booking.
          </p>
        </Clause>
        <Clause heading="Reporting a concern">
          <p>
            Security researchers and travellers can report vulnerabilities or safety concerns
            through our{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              contact desk
            </Link>
            . We acknowledge reports within one business day.
          </p>
        </Clause>
      </ContentBody>
    </PageShell>
  );
}
