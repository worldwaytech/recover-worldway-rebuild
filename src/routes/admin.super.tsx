import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser, type Role } from "@/lib/portal-store";
import { admin } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";
import { useVerifiedRole } from "@/hooks/use-verified-role";
import { Activity, ShieldAlert, Database, KeyRound, ScrollText, Network } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { StatTile } from "@/components/portal-shell";

export const Route = createFileRoute("/admin/super")({
  head: () => ({ meta: [{ title: "Super Admin — Worldway Travels Group" }] }),
  component: SuperAdmin,
});

function SuperAdmin() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [tick, setTick] = useState(0);
  const verified = useVerifiedRole(["super_admin"]);
  useEffect(() => {
    if (verified === "checking") return;
    if (verified === "denied") {
      nav({ to: "/auth" });
      return;
    }
    const s = portal.session();
    if (!s || s.role !== "super_admin") {
      nav({ to: "/auth" });
      return;
    }
    setMe(s);
    setUsers(portal.users());
  }, [nav, verified]);
  if (verified !== "allowed" || !me) return null;
  void tick;

  const keys = admin.apiKeys();
  const flags = admin.flags();
  const audit = admin.audit();

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Root access</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Super Admin</h1>
        <p className="text-sm text-muted-foreground">
          Global controls, role escalation, and audit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users" value={String(users.length)} />
        <StatTile
          label="Admins"
          value={String(users.filter((u) => u.role === "admin" || u.role === "super_admin").length)}
        />
        <StatTile
          label="Active keys"
          value={String(keys.filter((k) => k.status === "active").length)}
        />
        <StatTile label="Audit events" value={String(audit.length)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Network className="h-4 w-4" /> Universal API & Product Sync Center
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider controls, secure configuration, product provenance and audit trails.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/integrations">Manage supplier APIs</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className="rounded-2xl border border-border/60 bg-card/60 p-6"
          style={{ boxShadow: "var(--shadow-portal)" }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <Activity className="h-4 w-4 text-primary" /> API health
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Partner API</span>
              <span className="text-primary">Operational</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Concierge model</span>
              <span className="text-primary">Nominal</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Wallet gateway</span>
              <span className="text-primary">Operational</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Webhooks</span>
              <span className="text-primary">All delivering</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Region</span>
              <span>eu-west-1</span>
            </li>
          </ul>
        </div>
        <div
          className="rounded-2xl border border-border/60 bg-card/60 p-6"
          style={{ boxShadow: "var(--shadow-portal)" }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> Feature flags
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {flags.map((f) => (
              <li key={f.key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{f.label}</span>
                <button
                  onClick={() => {
                    admin.toggleFlag(f.key);
                    setTick((t) => t + 1);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] ${f.enabled ? "border-primary/40 text-primary" : "border-border/60 text-muted-foreground"}`}
                >
                  {f.enabled ? "on" : "off"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="rounded-2xl border border-border/60 bg-card/60 p-6"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <ScrollText className="h-4 w-4 text-primary" /> Role management
          </div>
        </div>
        <ul className="divide-y divide-border/40 text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-3">
              <div>
                {u.name} <span className="text-muted-foreground">· {u.email}</span>
              </div>
              <select
                value={u.role}
                onChange={(e) => {
                  portal.updateRole(u.id, e.target.value as Role);
                  admin.log("role.change", `${u.email} → ${e.target.value}`, "critical", me.email);
                  setUsers(portal.users());
                }}
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
              >
                {(["b2c", "b2b", "agent", "admin", "super_admin"] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-destructive/40 bg-card/60 p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-destructive">
            <ShieldAlert className="h-4 w-4" /> Danger zone
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Wipes all demo data (users, CRM, API keys, bookings, payments, audit) in this browser.
            Irreversible.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => {
              Object.keys(localStorage)
                .filter((k) => k.startsWith("wwtg:"))
                .forEach((k) => localStorage.removeItem(k));
              location.reload();
            }}
          >
            Reset all data
          </Button>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <Database className="h-4 w-4 text-primary" /> Recent audit
          </div>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {audit.slice(0, 6).map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {a.action} · {a.target}
                </span>
                <span className="whitespace-nowrap">{new Date(a.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
