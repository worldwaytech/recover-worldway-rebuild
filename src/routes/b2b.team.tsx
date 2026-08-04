import { createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/b2b/team")({
  head: () => ({
    meta: [
      { title: "Team — Worldway Corporate" },
      { name: "description", content: "Manage travellers and approvers in your organisation." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Team — Worldway Corporate" },
      {
        property: "og:description",
        content: "Manage travellers and approvers in your organisation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

const TEAM = [
  { name: "Priya Nair", email: "priya@acme.co", role: "Traveler", trips: 6 },
  { name: "David Kim", email: "david@acme.co", role: "Approver", trips: 2 },
  { name: "Sara Cohen", email: "sara@acme.co", role: "Admin", trips: 0 },
];

function Team() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">People</div>
          <h1 className="mt-2 font-serif text-3xl text-primary">Team · {TEAM.length}</h1>
        </div>
        <Button>Invite member</Button>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Trips (YTD)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TEAM.map((t) => (
              <TableRow key={t.email}>
                <TableCell>{t.name}</TableCell>
                <TableCell className="text-muted-foreground">{t.email}</TableCell>
                <TableCell>{t.role}</TableCell>
                <TableCell>{t.trips}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
