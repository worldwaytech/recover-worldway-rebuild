import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { kyc } from "@/lib/kyc-store";

export const Route = createFileRoute("/admin/kyc")({
  head: () => ({ meta: [{ title: "KYC Reviews — Admin" }] }),
  component: AdminKyc,
});

function AdminKyc() {
  const [, tick] = useState(0);
  const apps = kyc.applicants();
  const reviews = kyc.reviews();

  function decide(id: string, d: "approved" | "rejected") {
    kyc.decideReview(id, d);
    tick((x) => x + 1);
  }

  const sev: Record<string, string> = {
    high: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-primary">KYC & Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-verified applications flow through instantly; ambiguous items land here for manual
          sign-off.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { l: "Applicants", v: apps.length },
          {
            l: "Auto-approved",
            v: apps.filter((a) => a.status === "auto_approved" || a.status === "approved").length,
          },
          {
            l: "In review",
            v: apps.filter((a) => a.status === "review" || a.status === "submitted").length,
          },
          { l: "Rejected", v: apps.filter((a) => a.status === "rejected").length },
        ].map((k) => (
          <Card key={k.l} className="border-border/60">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{k.l}</div>
              <div className="mt-1 text-2xl font-medium">{k.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Open reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.filter((r) => r.status === "open").length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Nothing to review. 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {reviews
                .filter((r) => r.status === "open")
                .map((r) => {
                  const a = apps.find((x) => x.id === r.applicantId);
                  const docs = kyc.docsFor(r.applicantId);
                  return (
                    <div key={r.id} className="rounded-md border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {a?.name ?? "Unknown"}{" "}
                            <Badge variant="outline" className="text-[10px]">
                              {a?.role}
                            </Badge>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${sev[r.severity]}`}
                            >
                              {r.severity}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{r.reason}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {docs.map((d) => (
                              <Badge key={d.id} variant="outline" className="text-[10px]">
                                {d.type.toUpperCase()} · {d.status}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decide(r.id, "rejected")}
                          >
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => decide(r.id, "approved")}>
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">All applicants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Role</th>
                  <th className="p-2 text-left">Entity</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Docs</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  const ds = kyc.docsFor(a.id);
                  return (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="p-2">
                        {a.name}
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </td>
                      <td className="p-2">{a.role}</td>
                      <td className="p-2">{a.entity}</td>
                      <td className="p-2 capitalize">{a.status.replace("_", " ")}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {ds.length ? ds.map((d) => d.type.toUpperCase()).join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      No applicants yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
