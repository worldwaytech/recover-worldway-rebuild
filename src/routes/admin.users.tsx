import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser, type Role } from "@/lib/portal-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function UsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const refresh = () => setUsers(portal.users());
  useEffect(refresh, []);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Access control</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Users · {users.length}</h1>
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
              <TableHead>Provider</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <select
                    value={u.role}
                    onChange={(e) => {
                      portal.updateRole(u.id, e.target.value as Role);
                      refresh();
                    }}
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-sm"
                  >
                    <option value="b2c">b2c</option>
                    <option value="b2b">b2b</option>
                    <option value="agent">agent</option>
                    <option value="admin">admin</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </TableCell>
                <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                  {u.provider}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      portal.remove(u.id);
                      refresh();
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
