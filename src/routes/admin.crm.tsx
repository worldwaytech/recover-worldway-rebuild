import { createFileRoute } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatTile } from "@/components/portal-shell";
import { listEnquiries } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, NotConfigured, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/crm")({
  head: adminHead("CRM", "Customer enquiries and quote requests."),
  component: CrmPage,
});

type E = Awaited<ReturnType<typeof listEnquiries>>;

function CrmPage() {
  const q = useConsole<E>("enquiries", listEnquiries);
  const c = (q.data?.contacts ?? []) as any[];
  const r = (q.data?.quotes ?? []) as any[];
  return (
    <div className="space-y-8">
      <PageHead eyebrow="Customer relationships" title="CRM" intro="Real enquiries from the contact form and quote requests." />
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Contact messages" value={String(c.length)} />
          <StatTile label="Quote requests" value={String(r.length)} />
          <StatTile label="New" value={String([...c, ...r].filter((x) => x.status === "new").length)} />
        </div>
        <Tabs defaultValue="quotes">
          <TabsList><TabsTrigger value="quotes">Quote requests</TabsTrigger><TabsTrigger value="contacts">Contact messages</TabsTrigger><TabsTrigger value="deals">Deals pipeline</TabsTrigger></TabsList>
          <TabsContent value="quotes">
            <Panel>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Product</TableHead><TableHead>Party</TableHead><TableHead>Month</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.map((x) => (
                    <TableRow key={x.id}><TableCell>{x.full_name}<div className="text-xs text-muted-foreground">{x.email}</div></TableCell><TableCell>{x.product_title ?? x.product_kind}</TableCell><TableCell>{x.party_size ?? "—"}</TableCell><TableCell>{x.travel_month ?? "—"}</TableCell><TableCell>{x.status}</TableCell><TableCell>{when(x.created_at)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              {!r.length && <Empty>No quote requests yet.</Empty>}
            </Panel>
          </TabsContent>
          <TabsContent value="contacts">
            <Panel>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
                <TableBody>
                  {c.map((x) => (
                    <TableRow key={x.id}><TableCell>{x.name}<div className="text-xs text-muted-foreground">{x.email}</div></TableCell><TableCell>{x.category}</TableCell><TableCell>{x.subject}</TableCell><TableCell>{x.status}</TableCell><TableCell>{when(x.created_at)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              {!c.length && <Empty>No contact messages yet.</Empty>}
            </Panel>
          </TabsContent>
          <TabsContent value="deals">
            <NotConfigured what="Deals pipeline" note="There is no deals record in the database yet. Enquiries above are the real lead source." />
          </TabsContent>
        </Tabs>
      </QueryState>
    </div>
  );
}
