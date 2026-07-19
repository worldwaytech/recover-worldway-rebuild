import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Worldway Luxe | Speak with a Specialist" },
      { name: "description", content: "Get in touch with a Worldway Luxe specialist to plan your extraordinary journey." },
      { property: "og:title", content: "Contact Worldway Luxe" },
      { property: "og:description", content: "Speak with a Worldway Luxe travel specialist." },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: Contact,
});

function Contact() {
  const [submitting, setSubmitting] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    // TODO(Lovable Cloud): persist enquiry to `enquiries` table and email specialist.
    setTimeout(() => {
      toast.success("Thank you — a specialist will be in touch within one business day.");
      (e.target as HTMLFormElement).reset();
      setSubmitting(false);
    }, 600);
  }

  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading eyebrow="Get in touch" title="Speak with a specialist" />
            <p className="mt-6 text-muted-foreground">
              Share a little about your journey and a Worldway Luxe specialist will be in touch within
              one business day.
            </p>

            <div className="mt-10 space-y-4 text-sm">
              <a href="tel:+18883686533" className="flex items-center gap-3 hover:text-gold">
                <Phone className="h-4 w-4 text-gold" /> +1 888 368 6533 (US/CA toll free)
              </a>
              <a href="mailto:partners@worldwayluxe.com" className="flex items-center gap-3 hover:text-gold">
                <Mail className="h-4 w-4 text-gold" /> partners@worldwayluxe.com
              </a>
              <a href="https://wa.me/15145458999" target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold">
                <MessageCircle className="h-4 w-4 text-gold" /> WhatsApp us
              </a>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-sm border border-border bg-card p-8 shadow-soft">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">First name</label>
                <Input required name="firstName" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Last name</label>
                <Input required name="lastName" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Email</label>
                <Input required type="email" name="email" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Phone</label>
                <Input name="phone" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Destination of interest</label>
                <Input name="destination" placeholder="Africa, Asia, Antarctica…" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Tell us about your journey</label>
                <Textarea name="notes" rows={5} />
              </div>
            </div>
            <Button variant="gold" size="lg" className="mt-6 w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send enquiry"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
