import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { UserCircle2 } from "lucide-react";
import { listAgents } from "@/lib/admin/console.functions";
import { PageHead, QueryState, Empty, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/agents")({
  head: adminHead("Agents", "Travel agent accounts registered with Worldway."),
  component: AgentsPage,
});

type A = Awaited<ReturnType<typeof listAgents>>;

function AgentsPage() {
  const q = useConsole<A>("agents", listAgents);
  const agents = q.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHead eyebrow="Network" title={`Agents · ${q.data ? agents.length : "—"}`} intro="Accounts holding the agent role. Roles are changed on the Users screen." />
        <Button asChild><Link to="/agent/signup">Invite agent</Link></Button>
      </div>
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((a: any) => (
            <div key={a.id} className="flex items-start gap-4 rounded-2xl border border-border/60 bg-card/60 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><UserCircle2 className="h-6 w-6" /></span>
              <div className="min-w-0">
                <div className="font-serif text-lg text-primary">{a.name || "—"}</div>
                <div className="truncate text-sm text-muted-foreground">{a.email}</div>
                {a.company && <div className="text-xs text-muted-foreground">{a.company}</div>}
                <div className="mt-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
                  Joined {new Date(a.createdAt).toLocaleDateString()} · {a.bookings} bookings
                </div>
              </div>
            </div>
          ))}
        </div>
        {!agents.length && <Empty>No agent accounts yet.</Empty>}
      </QueryState>
    </div>
  );
}
