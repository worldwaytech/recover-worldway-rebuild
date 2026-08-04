import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portal } from "@/lib/portal-store";

export const Route = createFileRoute("/agent/signup")({
  head: () => ({ meta: [{ title: "Become an Agent — Worldway Travels Group" }] }),
  component: AgentSignup,
});

function AgentSignup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", agency: "", iata: "" });
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-serif text-4xl text-primary">Become a Worldway Agent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Join our advisor network. Commissions, priority support, private inventory.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            portal.signUp({ email: form.email, name: form.name, role: "agent" });
            nav({ to: "/agent" });
          }}
          className="mt-8 space-y-4"
        >
          <div>
            <Label>Full name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Work email</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Agency</Label>
            <Input
              value={form.agency}
              onChange={(e) => setForm({ ...form, agency: e.target.value })}
            />
          </div>
          <div>
            <Label>IATA / ARC (optional)</Label>
            <Input value={form.iata} onChange={(e) => setForm({ ...form, iata: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">
            Submit application
          </Button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
