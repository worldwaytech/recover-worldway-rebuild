import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { accountApi } from "@/lib/account-data";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account/travellers")({
  head: () => ({
    meta: [
      { title: "Saved travellers — Worldway Travels Group" },
      { name: "description", content: "Store passenger details once and book faster every time." },
      { property: "og:title", content: "Saved travellers — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Store passenger details once and book faster every time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Travellers,
});

const BLANK = {
  full_name: "",
  date_of_birth: "",
  nationality: "",
  passport_number: "",
  passport_expiry: "",
  frequent_flyer: "",
};

function Travellers() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["account", "travellers"],
    queryFn: accountApi.travellers,
  });
  const [form, setForm] = useState(BLANK);

  const add = useMutation({
    mutationFn: () =>
      accountApi.addTraveller({
        full_name: form.full_name.trim(),
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality.trim() || null,
        passport_number: form.passport_number.trim() || null,
        passport_expiry: form.passport_expiry || null,
        frequent_flyer: form.frequent_flyer.trim() || null,
      }),
    onSuccess: () => {
      setForm(BLANK);
      qc.invalidateQueries({ queryKey: ["account", "travellers"] });
      toast.success("Traveller saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: accountApi.removeTraveller,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", "travellers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Panel title="Add a traveller" description="Only you can see these details.">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.full_name.trim()) return toast.error("Full name is required");
            add.mutate();
          }}
        >
          <div>
            <Label htmlFor="t-name">Full name (as in passport)</Label>
            <Input
              id="t-name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-dob">Date of birth</Label>
            <Input
              id="t-dob"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-nat">Nationality</Label>
            <Input
              id="t-nat"
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-pp">Passport number</Label>
            <Input
              id="t-pp"
              value={form.passport_number}
              onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-ppx">Passport expiry</Label>
            <Input
              id="t-ppx"
              type="date"
              value={form.passport_expiry}
              onChange={(e) => setForm({ ...form, passport_expiry: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-ff">Frequent flyer</Label>
            <Input
              id="t-ff"
              value={form.frequent_flyer}
              onChange={(e) => setForm({ ...form, frequent_flyer: e.target.value })}
            />
          </div>
          <div className="lg:col-span-3">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Save traveller"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Travellers" description="Reused across flight, hotel and jet bookings.">
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : data.length === 0 ? (
          <EmptyState title="No travellers saved" hint="Add one above to speed up checkout." />
        ) : (
          <Rows>
            {data.map((t) => (
              <Row
                key={t.id}
                title={t.full_name}
                meta={`${t.nationality ?? "Nationality —"} · DOB ${fmtDate(t.date_of_birth)} · Passport exp. ${fmtDate(t.passport_expiry)}`}
                right={
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)}>
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
