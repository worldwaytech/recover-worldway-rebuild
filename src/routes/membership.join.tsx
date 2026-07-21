import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/membership/join")({
  head: () => ({
    meta: [
      { title: "Apply for Membership | Worldway Luxe" },
      { name: "description", content: "Request an invitation to the Worldway Circle — a private members' club for the discerning traveller." },
    ],
    links: [{ rel: "canonical", href: "/membership/join" }],
  }),
  component: Join,
});

function Join() {
  return (
    <main className="pt-24">
      <section className="container-lux py-14 max-w-3xl">
        <p className="eyebrow mb-3">Application</p>
        <h1 className="font-serif text-5xl">Request an invitation</h1>
        <p className="mt-3 text-muted-foreground">Membership is limited and reviewed by our head of membership. Applications are typically answered within seven business days.</p>

        <form className="mt-10 grid gap-6 rounded-sm border border-border bg-card p-6 shadow-soft md:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          {[
            { label: "Full name" }, { label: "Email", type: "email" }, { label: "Country of residence" }, { label: "Preferred tier" },
            { label: "Referred by (optional)" }, { label: "Annual travel budget" },
          ].map((f) => (
            <label key={f.label} className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{f.label}</span>
              <input type={f.type ?? "text"} className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Enable Lovable Cloud to submit" disabled />
            </label>
          ))}
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Tell us about how you travel</span>
            <textarea rows={5} disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Recent journeys, celebrated moments, aspirations…" />
          </label>
          <div className="md:col-span-2 flex gap-3">
            <Button variant="gold" disabled>Submit application</Button>
            <Link to="/contact"><Button type="button" variant="outline-ink">Speak with a specialist</Button></Link>
          </div>
        </form>
      </section>
    </main>
  );
}
