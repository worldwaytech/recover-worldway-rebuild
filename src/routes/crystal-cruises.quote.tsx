import { getCrystalVoyages } from "@/lib/crystal/crystal.functions";
import { hydrateLicensedVoyages } from "@/lib/crystal/inventory";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Crumbs, LicenceNotice, Section } from "@/components/crystal/crystal-ui";
import { voyageByCode } from "@/lib/crystal/inventory";
import { LiveAvailabilityPanel } from "@/components/crystal/live-availability";

const URL = "https://worldwaytravelsgroup.com/crystal-cruises/quote";
const TITLE = "Request a Crystal Cruise Quote — Worldway Travels Group";
const DESCRIPTION =
  "Tell a Worldway cruise specialist what you have in mind and receive a Worldway Luxury Cruises voyage quote, with flights, transfers and hotels on one booking record.";

export const Route = createFileRoute("/crystal-cruises/quote")({
  validateSearch: (raw: Record<string, unknown>): { voyage?: string } =>
    typeof raw.voyage === "string" && raw.voyage ? { voyage: raw.voyage.slice(0, 40) } : {},
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: () => getCrystalVoyages({ data: {} }),
  component: QuotePage,
});

function QuotePage() {
  const feed = Route.useLoaderData();
  hydrateLicensedVoyages(feed.voyages);
  const { voyage: voyageCode } = Route.useSearch();
  const voyage = voyageCode ? voyageByCode(voyageCode) : null;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    if (!full_name || !email) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("quote_requests").insert({
        user_id: auth.user?.id ?? null,
        product_kind: "crystal-cruise",
        product_slug: voyageCode ?? "general-enquiry",
        product_title: voyage?.title ?? "Worldway Luxury Cruises enquiry",
        full_name,
        email,
        phone: String(fd.get("phone") ?? "").trim() || undefined,
        travel_month: String(fd.get("travel_month") ?? "").trim() || undefined,
        party_size: Number(fd.get("party_size")) || undefined,
        budget: String(fd.get("budget") ?? "").trim() || undefined,
        message: String(fd.get("message") ?? "").trim() || undefined,
      });
      if (error) throw new Error(error.message);
      setDone(true);
      toast.success("Quote request received — a cruise specialist replies within 24 hours.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-6 pt-10">
        <Crumbs
          items={[{ label: "Worldway Luxury Cruises", to: "/crystal-cruises" }, { label: "Quote request" }]}
        />
      </div>
      <Section
        eyebrow="Reservations"
        title={voyage ? `Quote request — ${voyage.title}` : "Request a Crystal cruise quote"}
        intro="Your specialist confirms availability and fares through Crystal's authorised advisor channel, then places the reservation on your Worldway booking record."
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {done ? (
            <div className="rounded-xl border border-border/60 p-8">
              <h2 className="font-serif text-2xl">Request received</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A cruise specialist will be in touch within 24 hours. You can track it from your
                account once signed in.
              </p>
              <div className="mt-6 flex gap-3">
                <Button asChild>
                  <Link to="/account">Go to my account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/crystal-cruises">Back to Worldway Luxury Cruises</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border/60 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" name="full_name" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="travel_month">Preferred month</Label>
                  <Input id="travel_month" name="travel_month" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="party_size">Guests</Label>
                  <Input id="party_size" name="party_size" type="number" min={1} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="budget">Budget guide</Label>
                  <Input id="budget" name="budget" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="message">What are you looking for?</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  className="mt-1"
                  defaultValue={
                    voyage ? `Interested in voyage ${voyage.code} — ${voyage.title}.` : ""
                  }
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send quote request"}
              </Button>
            </form>
          )}
          <aside className="space-y-4">
            {voyage ? (
              <LiveAvailabilityPanel voyageNumber={voyage.code} currency={voyage.currency} />
            ) : null}
            <LicenceNotice />
            <div className="rounded-xl border border-border/60 p-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Prefer to talk it through?</p>
              <p className="mt-2">
                The AI Cruise Concierge can shortlist regions, ships and suite grades before you
                speak to a specialist.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link
                  to="/concierge"
                  search={{ prompt: "Help me choose a Worldway Luxury Cruises voyage." }}
                >
                  Open the concierge
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
