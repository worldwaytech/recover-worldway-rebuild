import { createFileRoute } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="Legal" title={title} />
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </section>
    </main>
  );
}

export { LegalPage };
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Worldway Luxe" },
      { name: "description", content: "How Worldway Luxe collects, uses and protects your information." },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: () => (
    <LegalPage title="Privacy Policy">
      <p>Worldway Luxe respects your privacy and is committed to protecting your personal data. This policy explains what we collect and how we use it.</p>
      <p>We collect only the information necessary to plan and deliver your journey, respond to enquiries, and improve our service. We never sell personal data.</p>
      <p>You may request access, correction or deletion of your personal data at any time by contacting <a href="mailto:privacy@worldwayluxe.com" className="text-gold">privacy@worldwayluxe.com</a>.</p>
    </LegalPage>
  ),
});
