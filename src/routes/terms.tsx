import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero, ContentBody, Clause, LEGAL_UPDATED } from "@/components/content-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Worldway Travels Group" },
      {
        name: "description",
        content:
          "The terms governing use of Worldway Travels Group: bookings, supplier conditions, pricing, payments and wallet, memberships, cancellations and liability.",
      },
      { property: "og:title", content: "Terms of Service — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Booking terms, supplier conditions, payments, memberships, cancellations and liability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Legal"
        title="Terms of Service"
        subtitle={`Last updated ${LEGAL_UPDATED}`}
      />
      <ContentBody>
        <Clause heading="1. Agreement">
          <p>
            By using worldwaytravelsgroup.com or any Worldway portal you agree to these terms. If
            you book on behalf of others, you confirm you are authorised to accept these terms for
            them.
          </p>
        </Clause>
        <Clause heading="2. Our role">
          <p>
            Worldway acts as an agent arranging travel services supplied by third parties (airlines,
            hotels, operators, charter providers). The supplier's own conditions of carriage or stay
            apply to each service and are made available before you confirm.
          </p>
        </Clause>
        <Clause heading="3. Pricing and availability">
          <p>
            Prices are drawn from live supplier responses and can change until a booking is
            confirmed and paid. Where a supplier withdraws or reprices inventory before
            confirmation, we will offer the revised price or a full refund of anything collected.
          </p>
        </Clause>
        <Clause heading="4. Payments and wallet">
          <p>
            Payment is due at confirmation unless stated otherwise. Wallet balances are prepaid
            credit usable against eligible bookings; they are not deposits, earn no interest, and
            are refundable to the original payment method subject to anti-fraud checks.
          </p>
        </Clause>
        <Clause heading="5. Changes and cancellations">
          <p>
            Change and cancellation rights follow the supplier's fare or rate rules disclosed at
            booking. Worldway service fees, where applied, are disclosed before payment and are
            non-refundable once a booking is issued.
          </p>
        </Clause>
        <Clause heading="6. Memberships">
          <p>
            Membership tiers renew for the stated term. Benefits may be varied with notice.
            Membership fees are non-refundable once benefits have been used in the current term.
          </p>
        </Clause>
        <Clause heading="7. Traveller responsibilities">
          <p>
            You are responsible for valid passports, visas, health requirements and accurate
            traveller details. Names must match travel documents; supplier correction fees are
            payable by you.
          </p>
        </Clause>
        <Clause heading="8. Acceptable use">
          <p>
            Automated scraping, resale of inventory without written authorisation, and interference
            with the platform or its APIs are prohibited.
          </p>
        </Clause>
        <Clause heading="9. Liability">
          <p>
            Worldway is not liable for supplier acts or omissions beyond its role as agent, nor for
            events outside its reasonable control. Nothing here excludes liability that cannot be
            excluded by law.
          </p>
        </Clause>
        <Clause heading="10. Contact">
          <p>
            Questions about these terms:{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              contact the concierge desk
            </Link>
            .
          </p>
        </Clause>
      </ContentBody>
    </PageShell>
  );
}
