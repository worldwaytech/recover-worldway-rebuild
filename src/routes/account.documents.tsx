import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { accountApi } from "@/lib/account-data";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/account/documents")({
  head: () => ({
    meta: [
      { title: "Travel documents — Worldway Travels Group" },
      { name: "description", content: "Track passports, visas and tickets with expiry reminders." },
      { property: "og:title", content: "Travel documents — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Track passports, visas and tickets with expiry reminders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Documents,
});

const TYPES = ["passport", "visa", "ticket", "insurance", "other"];

function Documents() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["account", "documents"],
    queryFn: accountApi.documents,
  });
  const [form, setForm] = useState({ title: "", doc_type: "passport", expires_on: "" });

  const add = useMutation({
    mutationFn: () =>
      accountApi.addDocument({
        title: form.title.trim(),
        doc_type: form.doc_type,
        expires_on: form.expires_on || null,
      }),
    onSuccess: () => {
      setForm({ title: "", doc_type: "passport", expires_on: "" });
      qc.invalidateQueries({ queryKey: ["account", "documents"] });
      toast.success("Document tracked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: accountApi.removeDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", "documents"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function expiryNote(d: string | null) {
    if (!d) return "";
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
    if (Number.isNaN(days)) return "";
    if (days < 0) return " · expired";
    if (days < 180) return ` · expires in ${days} days`;
    return "";
  }

  return (
    <div className="space-y-6">
      <Panel title="Track a document" description="We remind you before anything expires.">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim()) return toast.error("Give the document a title");
            add.mutate();
          }}
        >
          <div className="lg:col-span-2">
            <Label htmlFor="d-title">Title</Label>
            <Input
              id="d-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="UK passport — J. Smith"
            />
          </div>
          <div>
            <Label htmlFor="d-type">Type</Label>
            <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
              <SelectTrigger id="d-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="d-exp">Expires on</Label>
            <Input
              id="d-exp"
              type="date"
              value={form.expires_on}
              onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
            />
          </div>
          <div className="lg:col-span-4">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Track document"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Documents" description="Visible only to you.">
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : data.length === 0 ? (
          <EmptyState
            title="No documents tracked"
            hint="Add a passport or visa to get expiry reminders."
          />
        ) : (
          <Rows>
            {data.map((d) => (
              <Row
                key={d.id}
                title={d.title}
                meta={`${d.doc_type} · expires ${fmtDate(d.expires_on)}${expiryNote(d.expires_on)}`}
                right={
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(d.id)}>
                    Remove
                  </Button>
                }
              />
            ))}
          </Rows>
        )}
      </Panel>
    </div>
  );
}
