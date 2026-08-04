import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountApi } from "@/lib/account-data";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account/saved")({
  head: () => ({
    meta: [
      { title: "Saved journeys — Worldway Travels Group" },
      { name: "description", content: "Journeys, hotels and fares you bookmarked for later." },
      { property: "og:title", content: "Saved journeys — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Journeys, hotels and fares you bookmarked for later.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Saved,
});

function Saved() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["account", "saved"],
    queryFn: accountApi.saved,
  });
  const remove = useMutation({
    mutationFn: accountApi.removeSaved,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", "saved"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel title="Saved" description="Anything you bookmark while searching lands here.">
      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : data.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Bookmark a flight, hotel or journey to keep it here."
        />
      ) : (
        <Rows>
          {data.map((s) => (
            <Row
              key={s.id}
              title={s.label}
              meta={`${s.item_type} · saved ${fmtDate(s.created_at)}`}
              right={
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(s.id)}>
                  Remove
                </Button>
              }
            />
          ))}
        </Rows>
      )}
    </Panel>
  );
}
