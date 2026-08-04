import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/search-shell";
import { ContentHero } from "@/components/content-page";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, Clock } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact the Worldway Concierge Desk" },
      {
        name: "description",
        content:
          "Reach Worldway Travels Group for bookings, changes, corporate travel, agent partnerships or support. Our concierge desk answers 24/7.",
      },
      { property: "og:title", content: "Contact Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Reach our concierge desk 24/7 for bookings, changes, corporate travel and partnerships.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

const CATEGORIES = [
  "general",
  "booking",
  "change or cancellation",
  "corporate travel",
  "agent partnership",
  "billing",
] as const;

function ContactPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    category: "general",
    subject: "",
    message: "",
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("contact_messages").insert({
        user_id: session.session?.user.id ?? null,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      if (error) throw error;
      setDone(true);
      toast.success("Message received — our concierge desk will reply shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <ContentHero
        eyebrow="Concierge desk"
        title="Talk to a specialist."
        subtitle="Bookings, changes, corporate programmes and partnerships — one desk, answered around the clock."
      />
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="text-foreground">concierge@worldwaytravelsgroup.com</div>
              <div className="text-xs">Replies within 2 hours</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="text-foreground">+1 (800) 000-0000</div>
              <div className="text-xs">Members line</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="text-foreground">24 / 7 / 365</div>
              <div className="text-xs">Including in-trip assistance</div>
            </div>
          </div>
        </div>

        {done ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8">
            <h2 className="font-serif text-2xl text-foreground">Message received</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A specialist will respond to {form.email} shortly. For urgent in-trip matters, call
              the members line.
            </p>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 md:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input required placeholder="Full name" value={form.name} onChange={set("name")} />
              <Input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={set("email")}
              />
              <Input placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm capitalize"
                value={form.category}
                onChange={set("category")}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <Input required placeholder="Subject" value={form.subject} onChange={set("subject")} />
            <Textarea
              required
              rows={6}
              placeholder="How can we help?"
              value={form.message}
              onChange={set("message")}
            />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send to concierge desk"}
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
