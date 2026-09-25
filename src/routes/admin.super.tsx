import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationCenter } from "@/lib/integrations/integrations.functions";
import { portal, type PortalUser } from "@/lib/portal-store";
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
          <SupplierHealth />
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
        <p className="text-sm text-muted-foreground">
          Roles are granted and revoked on the Users screen, where every change is verified
          server-side and written to the audit log.
        </p>
        <Link
          to="/admin/users"
          className="mt-4 inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
        >
          Open user &amp; role administration
        </Link>
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

function SupplierHealth() {
  const load = useServerFn(getIntegrationCenter);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    load({ data: {} as never })
      .then((r) => setRows(((r as unknown as { providers?: Record<string, unknown>[] }).providers ?? [])))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load supplier health"));
  }, [load]);
  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Loading supplier health…</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((p) => {
        const name = String(p["display_name"] ?? p["name"] ?? p["provider_key"] ?? "");
        const state = String(p["connection_state"] ?? p["connectionState"] ?? p["status"] ?? "unknown");
        return (
          <div key={String(p["provider_key"] ?? name)} className="rounded-lg border border-border/60 bg-card p-3">
            <p className="text-sm text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{state}</p>
          </div>
        );
      })}
    </div>
  );
}
