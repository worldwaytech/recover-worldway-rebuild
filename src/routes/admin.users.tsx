import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  listManagedUsers,
  setManagedUserActive,
  setManagedUserRole,
  type ManagedRole,
  type ManagedUser,
} from "@/lib/admin/users.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Worldway Admin" },
      { name: "description", content: "Manage customer accounts, roles and access." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Users — Worldway Admin" },
      { property: "og:description", content: "Manage customer accounts, roles and access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

const ROLES: ManagedRole[] = ["b2c", "b2b", "agent", "admin", "super_admin"];

function UsersPage() {
  const load = useServerFn(listManagedUsers);
  const changeRole = useServerFn(setManagedUserRole);
  const changeActive = useServerFn(setManagedUserActive);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUsers(await load({}));
      setState("ready");
    } catch {
      setState("denied");
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function apply(id: string, run: () => Promise<unknown>, message: string) {
    setBusy(id);
    try {
      await run();
      toast.success(message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That change could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading")
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verifying your access…
      </div>
    );

  if (state === "denied")
    return (
      <div className="py-20 text-sm text-muted-foreground">
        Account administration is available to Super Admins only.
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Access control</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Users · {users.length}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Role changes and deactivations are applied on the server and permanently recorded.
          Deactivating an account blocks sign-in while preserving its booking and payment history.
        </p>
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
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.fullName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                <TableCell>
                  <select
                    value={u.roles[0] ?? "b2c"}
                    disabled={busy !== null}
                    onChange={(e) =>
                      void apply(
                        u.id,
                        () =>
                          changeRole({
                            data: { userId: u.id, role: e.target.value as ManagedRole },
                          }),
                        "Role updated.",
                      )
                    }
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? "secondary" : "destructive"}>
                    {u.active ? "Active" : "Deactivated"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void apply(
                        u.id,
                        () => changeActive({ data: { userId: u.id, active: !u.active } }),
                        u.active ? "Account deactivated." : "Account reactivated.",
                      )
                    }
                  >
                    {busy === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : u.active ? (
                      "Deactivate"
                    ) : (
                      "Reactivate"
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No accounts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
