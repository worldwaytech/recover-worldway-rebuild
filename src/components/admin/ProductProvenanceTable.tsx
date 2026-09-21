// Shared, staff-only product provenance panel.
//
// Every supplier console renders this one component so each product shows the
// same seven columns — Supplier, API source, External ID, Sync status, Last
// sync — with SYNC NOW and API DATA actions. Customer-facing pages never use it.
import { useCallback, useEffect, useState } from "react";
import { Braces, Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getIntegrationProductData,
  getSupplierProductLedger,
  resolveIntegrationConflict,
  runIntegrationSync,
} from "@/lib/integrations/integrations.functions";
import type { IntegrationProductRow } from "@/lib/integrations/types";

function ago(value: string | null): string {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface ProductProvenanceTableProps {
  /** Provider key in the integration ledger, e.g. "ttc" or "hbx-hotels". */
  providerKey: string;
  title?: string;
  description?: string;
}

export function ProductProvenanceTable({
  providerKey,
  title = "API provenance",
  description = "Supplier, API source, external ID and sync state for every indexed product.",
}: ProductProvenanceTableProps) {
  const loadLedger = useServerFn(getSupplierProductLedger);
  const syncProvider = useServerFn(runIntegrationSync);
  const loadApiData = useServerFn(getIntegrationProductData);
  const resolveConflict = useServerFn(resolveIntegrationConflict);

  const [rows, setRows] = useState<IntegrationProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [apiData, setApiData] = useState<unknown>(null);
  const [dataOpen, setDataOpen] = useState(false);

  const refresh = useCallback(
    async (search?: string) => {
      try {
        const result = await loadLedger({
          data: { providerKey, ...(search ? { query: search } : {}) },
        });
        setRows(result.rows);
        setTotal(result.total);
        setState("ready");
      } catch {
        setState("denied");
      }
    },
    [loadLedger, providerKey],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state === "denied") return null;

  return (
    <section className="space-y-3 border-y border-border/60 bg-card/30 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-primary">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            value={query}
            placeholder="Title or external ID"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh(query);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              void (async () => {
                setBusy("sync-all");
                try {
                  await syncProvider({ data: { providerKey, scope: "incremental" } });
                  toast.success("Supplier sync completed.");
                  await refresh(query);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Sync failed.");
                } finally {
                  setBusy(null);
                }
              })()
            }
          >
            {busy === "sync-all" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Sync supplier
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/60 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="py-3 pr-4">Product</th>
              <th className="px-3">Supplier</th>
              <th className="px-3">API source / External ID</th>
              <th className="px-3">Sync status</th>
              <th className="px-3">Last sync</th>
              <th className="py-3 pl-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border/40 align-top">
                <td className="py-3 pr-4">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.productType}</div>
                </td>
                <td className="px-3 py-3">{p.providerName}</td>
                <td className="px-3 py-3">
                  <div className="font-mono text-xs">{p.providerKey}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.externalId}</div>
                </td>
                <td className="px-3 py-3">
                  <Badge variant={p.syncStatus === "synced" ? "secondary" : "outline"}>
                    {p.syncStatus}
                  </Badge>
                  {p.conflictState !== "none" && (
                    <div className="mt-1 space-y-1">
                      <div className="text-xs text-destructive">Conflict: {p.conflictState}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[0.7rem]"
                        disabled={busy !== null}
                        onClick={() =>
                          void (async () => {
                            setBusy(`conflict:${p.id}`);
                            try {
                              const out = await resolveConflict({
                                data: {
                                  providerKey: p.providerKey,
                                  externalId: p.externalId,
                                  resolution: "accept-supplier",
                                },
                              });
                              toast.success(out.detail);
                              await refresh(query);
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Could not resolve.",
                              );
                            } finally {
                              setBusy(null);
                            }
                          })()
                        }
                      >
                        Accept supplier data
                      </Button>
                    </div>
                  )}
                  {p.lastError && (
                    <div className="mt-1 max-w-64 truncate text-xs text-destructive">
                      {p.lastError}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{ago(p.lastSyncedAt)}</td>
                <td className="py-3 pl-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        void (async () => {
                          setBusy(`sync:${p.id}`);
                          try {
                            await syncProvider({
                              data: {
                                providerKey: p.providerKey,
                                scope: "product",
                                externalId: p.externalId,
                              },
                            });
                            toast.success(`${p.title} synchronized.`);
                            await refresh(query);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Sync failed.");
                          } finally {
                            setBusy(null);
                          }
                        })()
                      }
                    >
                      {busy === `sync:${p.id}` ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      Sync now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        void (async () => {
                          setBusy(`data:${p.id}`);
                          try {
                            setApiData(
                              await loadApiData({
                                data: { providerKey: p.providerKey, externalId: p.externalId },
                              }),
                            );
                            setDataOpen(true);
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "API data unavailable.",
                            );
                          } finally {
                            setBusy(null);
                          }
                        })()
                      }
                    >
                      <Braces className="mr-1 h-3 w-3" />
                      API data
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state === "loading" && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading provenance…
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No indexed products for this supplier yet. Run a sync to build the index.
        </p>
      )}
      {state === "ready" && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {total} indexed products.
        </p>
      )}

      <Dialog open={dataOpen} onOpenChange={setDataOpen}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Sanitized supplier data</DialogTitle>
            <DialogDescription>
              Credential fields are removed before records and logs are stored.
            </DialogDescription>
          </DialogHeader>
          <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(apiData, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </section>
  );
}
