import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { Button } from "@/components/ui/button";
import { UserCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Worldway Admin" },
      { name: "description", content: "Manage travel agent accounts and commissions." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Agents — Worldway Admin" },
      { property: "og:description", content: "Manage travel agent accounts and commissions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const [agents, setAgents] = useState<PortalUser[]>([]);
  useEffect(() => {
    setAgents(portal.users().filter((u) => u.role === "agent"));
  }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Network</div>
          <h1 className="mt-2 font-serif text-3xl text-primary">Agents · {agents.length}</h1>
        </div>
        <Button asChild>
          <Link to="/agent/signup">Invite agent</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-4 rounded-2xl border border-border/60 bg-card/60 p-5"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <UserCircle2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="font-serif text-lg text-primary">{a.name}</div>
              <div className="truncate text-sm text-muted-foreground">{a.email}</div>
              <div className="mt-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
                Joined {new Date(a.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            No agents yet. Invite your first partner to get started.
          </p>
        )}
      </div>
    </div>
  );
}
