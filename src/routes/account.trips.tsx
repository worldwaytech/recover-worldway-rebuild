import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { accountApi } from "@/lib/account-data";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account/trips")({
  head: () => ({
    meta: [
      { title: "My trips — Worldway Travels Group" },
      {
        name: "description",
        content: "Plan, track and manage every Worldway journey in one place.",
      },
      { property: "og:title", content: "My trips — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Plan, track and manage every Worldway journey in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Trips,
});

function Trips() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["account", "trips"],
    queryFn: accountApi.trips,
  });
  const [form, setForm] = useState({ name: "", destination: "", start_date: "", end_date: "" });

  const add = useMutation({
    mutationFn: () =>
      accountApi.addTrip({
        name: form.name.trim(),
        destination: form.destination.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    onSuccess: () => {
      setForm({ name: "", destination: "", start_date: "", end_date: "" });
      qc.invalidateQueries({ queryKey: ["account", "trips"] });
      toast.success("Trip added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: accountApi.removeTrip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", "trips"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Panel title="Add a trip" description="Group your bookings under a named journey.">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Give the trip a name");
            add.mutate();
          }}
        >
          <div className="lg:col-span-2">
            <Label htmlFor="trip-name">Trip name</Label>
            <Input
              id="trip-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Maldives escape"
            />
          </div>
          <div>
            <Label htmlFor="trip-dest">Destination</Label>
            <Input
              id="trip-dest"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder="Malé"
            />
          </div>
          <div>
            <Label htmlFor="trip-start">Start</Label>
            <Input
              id="trip-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="trip-end">End</Label>
            <Input
              id="trip-end"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
          <div className="lg:col-span-5">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Add trip"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Your trips" description="Upcoming journeys first.">
        {isLoading ? (
          <EmptyState title="Loading your trips…" />
        ) : data.length === 0 ? (
          <EmptyState title="No trips yet" hint="Create one above to start grouping bookings." />
        ) : (
          <Rows>
            {data.map((t) => (
              <Row
                key={t.id}
                title={t.name}
                meta={`${t.destination ?? "Destination TBC"} · ${fmtDate(t.start_date)} – ${fmtDate(t.end_date)} · ${t.status}`}
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
