import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { admin, type Lead, type Contact, type Deal } from "@/lib/admin-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus } from "lucide-react";
import { StatTile } from "@/components/portal-shell";

export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM — Worldway Travels Group" }] }),
  component: CrmPage,
});

function CrmPage() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const leads = admin.leads(),
    contacts = admin.contacts(),
    deals = admin.deals();
  void tick;

  const pipeline = deals.reduce((sum, d) => (d.stage !== "lost" ? sum + d.amount : sum), 0);
  const won = deals.filter((d) => d.stage === "won").reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">
          Customer relationships
        </div>
        <h1 className="mt-2 font-serif text-3xl text-primary">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Leads, contacts, and pipeline for your luxury travel desk.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open leads"
          value={String(leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length)}
        />
        <StatTile label="Contacts" value={String(contacts.length)} />
        <StatTile label="Pipeline" value={`$${(pipeline / 1000).toFixed(0)}K`} />
        <StatTile label="Won" value={`$${(won / 1000).toFixed(0)}K`} />
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <LeadsPanel leads={leads} refresh={refresh} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsPanel contacts={contacts} refresh={refresh} />
        </TabsContent>
        <TabsContent value="deals">
          <DealsPanel deals={deals} refresh={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60"
      style={{ boxShadow: "var(--shadow-portal)" }}
    >
      {children}
    </div>
  );
}

function LeadsPanel({ leads, refresh }: { leads: Lead[]; refresh: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [value, setValue] = useState("");
  function add() {
    if (!name || !email) return;
    admin.addLead({
      name,
      email,
      source: "web",
      interest: "trip",
      value: Number(value) || 0,
      stage: "new",
    });
    setName("");
    setEmail("");
    setValue("");
    refresh();
  }
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-2 border-b border-border/40 p-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-48"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-64"
          />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value (USD)"
            type="number"
            className="w-36"
          />
          <Button onClick={add}>
            <Plus className="mr-1 h-4 w-4" /> Add lead
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell className="text-muted-foreground">{l.email}</TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {l.source}
                </TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {l.interest}
                </TableCell>
                <TableCell>${l.value.toLocaleString()}</TableCell>
                <TableCell>
                  <select
                    value={l.stage}
                    onChange={(e) => {
                      admin.updateLead(l.id, { stage: e.target.value as Lead["stage"] });
                      refresh();
                    }}
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                  >
                    {(["new", "qualified", "proposal", "won", "lost"] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      admin.removeLead(l.id);
                      refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function ContactsPanel({ contacts, refresh }: { contacts: Contact[]; refresh: () => void }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>LTV</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-muted-foreground">{c.email}</TableCell>
              <TableCell>
                <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-primary">
                  {c.tier}
                </span>
              </TableCell>
              <TableCell>${c.ltv.toLocaleString()}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.tags.join(" · ")}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.removeContact(c.id);
                    refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DealsPanel({ deals, refresh }: { deals: Deal[]; refresh: () => void }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.title}</TableCell>
              <TableCell className="text-muted-foreground">{d.contact}</TableCell>
              <TableCell>${d.amount.toLocaleString()}</TableCell>
              <TableCell>
                <select
                  value={d.stage}
                  onChange={(e) => {
                    admin.updateDeal(d.id, { stage: e.target.value as Deal["stage"] });
                    refresh();
                  }}
                  className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                >
                  {(["discovery", "quote", "negotiation", "won", "lost"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell className="text-muted-foreground">{d.owner}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.removeDeal(d.id);
                    refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
