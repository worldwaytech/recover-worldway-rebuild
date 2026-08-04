import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero, ContentBody, Clause, LEGAL_UPDATED } from "@/components/content-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Worldway Travels Group" },
      {
        name: "description",
        content:
          "How Worldway Travels Group collects, uses, shares and retains personal data for travel bookings, payments and concierge services, and your rights over that data.",
      },
      { property: "og:title", content: "Privacy Policy — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "How we collect, use, share and retain personal data, and the rights you hold over it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle={`Last updated ${LEGAL_UPDATED}`}
      />
      <ContentBody>
        <Clause heading="1. Who we are">
          <p>
            Worldway Travels Group ("Worldway", "we") is the controller of personal data processed
            through worldwaytravelsgroup.com and its member portals.
          </p>
        </Clause>
        <Clause heading="2. Data we collect">
          <p>
            Account data (name, email, phone, password credentials held by our authentication
            provider); traveller data you supply for bookings (passenger names, dates of birth,
            document numbers, loyalty numbers); booking and payment records; support and concierge
            conversations; and technical data such as IP address, device and usage logs.
          </p>
        </Clause>
        <Clause heading="3. Why we process it">
          <p>
            To create and secure your account; to search, book and service travel with suppliers; to
            take payment and maintain your wallet ledger; to meet legal, tax and anti-fraud
            obligations; to provide support; and, where you consent, to send offers.
          </p>
        </Clause>
        <Clause heading="4. Who we share it with">
          <p>
            Airlines, hotels, ground operators, charter operators and other suppliers strictly as
            needed to fulfil your booking; payment processors; identity-verification providers; and
            authorities where legally required. Suppliers may be located outside your country;
            transfers are made under appropriate safeguards.
          </p>
        </Clause>
        <Clause heading="5. Retention">
          <p>
            Booking and financial records are kept for the period required by tax and travel
            regulation. Account data is kept while your account is active and deleted or anonymised
            afterwards, subject to those obligations.
          </p>
        </Clause>
        <Clause heading="6. Your rights">
          <p>
            Subject to local law you may request access, correction, deletion, restriction,
            portability, or object to processing, and withdraw consent to marketing at any time.
            Requests are handled through our{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              contact desk
            </Link>
            .
          </p>
        </Clause>
        <Clause heading="7. Security">
          <p>
            Data is encrypted in transit, access is role-based and audited, and records are scoped
            to their owner by row-level security. See{" "}
            <Link to="/trust" className="text-primary underline-offset-4 hover:underline">
              Trust &amp; Safety
            </Link>
            .
          </p>
        </Clause>
        <Clause heading="8. Cookies">
          <p>
            See our{" "}
            <Link to="/cookies" className="text-primary underline-offset-4 hover:underline">
              Cookie Policy
            </Link>
            .
          </p>
        </Clause>
        <Clause heading="9. Changes">
          <p>We will post any change to this policy on this page and update the date above.</p>
        </Clause>
      </ContentBody>
    </PageShell>
  );
}
