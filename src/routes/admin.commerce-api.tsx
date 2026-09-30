import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addPartnerMember, createPartnerKey, createPartnerTenant, listPartnerTenants, revokePartnerKey, setPartnerStatus } from "@/lib/commerce/partners.functions";

export const Route = createFileRoute("/admin/commerce-api")({
  head: () => ({
    meta: [
      { title: "Travel Commerce API — Worldway Admin" },
      { name: "description", content: "Manage B2B and white-label partners, API keys, members and usage for the Worldway Travel Commerce API." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommerceApiAdmin,
});

const ALL_SCOPES = ["flights.search", "tours.read", "tours.quote", "trips.plan"] as const;
type Tenant = Awaited<ReturnType<typeof listPartnerTenants>>[number];

function CommerceApiAdmin() {
  const list = useServerFn(listPartnerTenants);
  const create = useServerFn(createPartnerTenant);
  const mkKey = useServerFn(createPartnerKey);
  const revoke = useServerFn(revokePartnerKey);
  const status = useServerFn(setPartnerStatus);
  const member = useServerFn(addPartnerMember);
  const [rows, setRows] = useState<Tenant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"b2b" | "white_label">("b2b");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = () => list().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  useEffect(() => { void load(); }, []);

  const act = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); toast.success(ok); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Travel Commerce API</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Partners call <code>POST /api/public/v1/commerce/&#123;search-flights | search-tours | tour-availability | quote-tour | plan-trip&#125;</code> with an API key
          (<code>X-Api-Key</code>) or a partner user's sign-in token. Booking is not available through the API.
        </p>
      </div>
      {err && <p className="text-sm text-destructive">{err === "Forbidden" ? "Super Admin only." : err}</p>}
      {newKey && (
        <Card className="border-primary">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">New API key. Copy it now; it will not be shown again.</p>
            <code className="block break-all rounded bg-muted p-2 text-xs">{newKey}</code>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(newKey); toast.success("Copied"); }}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Done</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Add partner</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Partner name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <select className="rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as never)}>
            <option value="b2b">B2B</option><option value="white_label">White-label</option>
          </select>
          <Button disabled={name.trim().length < 2} onClick={() => act(() => create({ data: { name, kind, rateLimitPerMinute: 60 } }).then(() => setName("")), "Partner added")}>Add</Button>
        </CardContent>
      </Card>
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No partners yet.</p>}
      {rows?.map((t) => <TenantCard key={t.id} t={t} onKey={(scopes, label) => act(() => mkKey({ data: { tenantId: t.id, label, scopes, expiresInDays: 365 } }).then((r) => setNewKey(r.key)), "Key created")}
        onRevoke={(id) => act(() => revoke({ data: { keyId: id } }), "Key revoked")}
        onStatus={(s) => act(() => status({ data: { tenantId: t.id, status: s } }), "Updated")}
        onMember={(email, role) => act(async () => { const r = await member({ data: { tenantId: t.id, email, role } }); if (!r.ok) throw new Error(r.error); }, "Member added")} />)}
    </div>
  );
}

function TenantCard({ t, onKey, onRevoke, onStatus, onMember }: {
  t: Tenant; onKey: (s: string[], label: string) => void; onRevoke: (id: string) => void; onStatus: (s: "active" | "suspended") => void; onMember: (email: string, role: "owner" | "developer" | "viewer") => void;
}) {
  const [scopes, setScopes] = useState<string[]>(["flights.search", "tours.read"]);
  const [label, setLabel] = useState("Production");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "developer" | "viewer">("developer");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t.name} <Badge variant="secondary" className="ml-2">{t.kind === "white_label" ? "White-label" : "B2B"}</Badge> <Badge variant={t.status === "active" ? "default" : "destructive"} className="ml-1">{t.status}</Badge></CardTitle>
        <Button size="sm" variant="outline" onClick={() => onStatus(t.status === "active" ? "suspended" : "active")}>{t.status === "active" ? "Suspend" : "Reactivate"}</Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{t.members} member(s) · {t.rate_limit_per_minute} calls/min · last 24h: {t.calls24h} calls, {t.errors24h} errors</p>
        <div className="space-y-1">
          {t.keys.map((k: any) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2 border-b py-1">
              <code className="text-xs">{k.key_prefix}…</code><span>{k.label}</span>
              <span className="text-xs text-muted-foreground">{k.scopes.join(", ")}</span>
              <span className="text-xs text-muted-foreground">{k.revoked_at ? "revoked" : k.expires_at ? `expires ${new Date(k.expires_at).toLocaleDateString()}` : ""}{k.last_used_at ? ` · used ${new Date(k.last_used_at).toLocaleString()}` : " · never used"}</span>
              {!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => onRevoke(k.id)}>Revoke</Button>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-[10rem]" />
          {ALL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />{s}</label>
          ))}
          <Button size="sm" disabled={!scopes.length || label.trim().length < 2} onClick={() => onKey(scopes, label)}>New key</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Member email" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as never)}>
            <option value="owner">Owner</option><option value="developer">Developer</option><option value="viewer">Viewer</option>
          </select>
          <Button size="sm" variant="outline" disabled={!email.includes("@")} onClick={() => onMember(email, role)}>Add member</Button>
        </div>
      </CardContent>
    </Card>
  );
}
