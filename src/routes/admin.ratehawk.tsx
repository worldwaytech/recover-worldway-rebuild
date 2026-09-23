import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  getRatehawkAdminOverview,
  getRatehawkHotelRates,
  runRatehawkValidation,
  searchRatehawkHotels,
  testRatehawkConnection,
} from "@/lib/ratehawk/ratehawk.functions";
import { ProductProvenanceTable } from "@/components/admin/ProductProvenanceTable";

type Overview = Awaited<ReturnType<typeof getRatehawkAdminOverview>>;
type Validation = Awaited<ReturnType<typeof runRatehawkValidation>>;
type SearchResult = Awaited<ReturnType<typeof searchRatehawkHotels>>;

export const Route = createFileRoute("/admin/ratehawk")({
  head: () => ({
    meta: [
      { title: "RateHawk connector console — Worldway Admin" },
      {
        name: "description",
        content:
          "Operate the RateHawk (Emerging Travel Group) hotel supplier: sandbox credentials, API health, live search, rates, prebook, booking status and cancellation.",
      },
      { property: "og:title", content: "RateHawk connector console — Worldway Admin" },
      {
        property: "og:description",
        content:
          "Sandbox-first RateHawk hotel integration: connection health, live search and the full booking lifecycle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatehawkConsole,
});

function RatehawkConsole() {
  const load = useServerFn(getRatehawkAdminOverview);
  const test = useServerFn(testRatehawkConnection);
  const validate = useServerFn(runRatehawkValidation);
  const search = useServerFn(searchRatehawkHotels);
  const rates = useServerFn(getRatehawkHotelRates);

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Validation | null>(null);
  const [offers, setOffers] = useState<SearchResult | null>(null);

  const day = 24 * 60 * 60 * 1000;
  const [form, setForm] = useState({
    regionId: "965847972",
    checkin: new Date(Date.now() + 60 * day).toISOString().slice(0, 10),
    checkout: new Date(Date.now() + 62 * day).toISOString().slice(0, 10),
    residency: "gb",
    adults: "2",
  });

  async function refresh(probe = false) {
    setLoading(true);
    try {
      setData((await load({ data: { probe } })) as Overview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the RateHawk console.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onTest() {
    setBusy("test");
    try {
      const res = await test({});
      toast[res.ok ? "success" : "warning"](res.detail);
      await refresh(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test connection failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onSearch() {
    setBusy("search");
    setOffers(null);
    try {
      const res = (await search({
        data: {
          regionId: Number(form.regionId),
          checkin: form.checkin,
          checkout: form.checkout,
          residency: form.residency,
          guests: [{ adults: Number(form.adults) }],
        },
      })) as SearchResult;
      setOffers(res);
      if (!res.ok) toast.warning(res.error.message);
      else toast.success(`${res.offers.length} hotels returned in ${res.meta.latencyMs}ms.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onRates(hid: number) {
    setBusy(`rates-${hid}`);
    try {
      const res = await rates({
        data: {
          hid,
          regionId: Number(form.regionId),
          checkin: form.checkin,
          checkout: form.checkout,
          residency: form.residency,
          guests: [{ adults: Number(form.adults) }],
        },
      });
      if (!res.ok) toast.warning(res.error.message);
      else setOffers({ ...(res as SearchResult) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rate request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onValidate(book: boolean) {
    setBusy("validate");
    setReport(null);
    try {
      const res = (await validate({
        data: {
          regionId: Number(form.regionId),
          checkin: form.checkin,
          checkout: form.checkout,
          residency: form.residency,
          book,
        },
      })) as Validation;
      setReport(res);
      toast[res.passed ? "success" : "warning"](res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation run failed.");
    } finally {
      setBusy(null);
    }
  }

  const connected = data?.connectionState === "connected";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">RateHawk connector</h1>
          <p className="text-sm text-muted-foreground">
            Hotels via Emerging Travel Group · environment{" "}
            <span className="uppercase">{data?.environment ?? "—"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => void onTest()} disabled={busy === "test"}>
            <Activity className="mr-2 h-4 w-4" /> Test connection
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Connection</CardTitle>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? (
              <ShieldCheck className="mr-1 h-3 w-3" />
            ) : (
              <ShieldAlert className="mr-1 h-3 w-3" />
            )}
            {data?.credentials.configured ? (connected ? "CONNECTED" : "NOT VERIFIED") : "NOT CONNECTED"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{data?.health.detail ?? "Loading…"}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Host</dt>
              <dd className="font-mono text-xs">{data?.host ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Credential names</dt>
              <dd className="font-mono text-xs">{data?.secretNames.join(", ") ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Capabilities</dt>
              <dd className="text-xs">{data?.capabilities.join(" · ") ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Missing credentials</dt>
              <dd className="text-xs">{data?.credentials.missing.join(", ") || "none"}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Credentials are read on the server only. Values are never shown here, stored in the database, or sent to
            the browser.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="rh-region">Region ID</Label>
              <Input
                id="rh-region"
                value={form.regionId}
                onChange={(e) => setForm({ ...form, regionId: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rh-in">Check-in</Label>
              <Input
                id="rh-in"
                type="date"
                value={form.checkin}
                onChange={(e) => setForm({ ...form, checkin: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rh-out">Check-out</Label>
              <Input
                id="rh-out"
                type="date"
                value={form.checkout}
                onChange={(e) => setForm({ ...form, checkout: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rh-res">Residency</Label>
              <Input
                id="rh-res"
                value={form.residency}
                onChange={(e) => setForm({ ...form, residency: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rh-adults">Adults</Label>
              <Input
                id="rh-adults"
                value={form.adults}
                onChange={(e) => setForm({ ...form, adults: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onSearch()} disabled={busy === "search" || !data?.credentials.configured}>
              Search
            </Button>
            <Button
              variant="outline"
              onClick={() => void onValidate(false)}
              disabled={busy === "validate" || !data?.credentials.configured}
            >
              <PlayCircle className="mr-2 h-4 w-4" /> Verify search → prebook
            </Button>
            <Button
              variant="outline"
              onClick={() => void onValidate(true)}
              disabled={busy === "validate" || !data?.credentials.configured || data?.environment !== "sandbox"}
            >
              <PlayCircle className="mr-2 h-4 w-4" /> Full sandbox flow (books, then cancels)
            </Button>
          </div>
          {!data?.credentials.configured && (
            <p className="text-xs text-muted-foreground">
              Sandbox credentials are required before any call can be made.
            </p>
          )}

          {offers && offers.ok && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Hotel ID</th>
                    <th className="py-2">HID</th>
                    <th className="py-2">Rates</th>
                    <th className="py-2">Lead price</th>
                    <th className="py-2">Refundable</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {offers.offers.slice(0, 25).map((offer) => {
                    const lead = offer.rates[0];
                    return (
                      <tr key={`${offer.hotelId}-${offer.hid}`} className="border-t">
                        <td className="py-2 font-mono text-xs">{offer.hotelId}</td>
                        <td className="py-2 font-mono text-xs">{offer.hid ?? "—"}</td>
                        <td className="py-2">{offer.rates.length}</td>
                        <td className="py-2">
                          {lead?.price.amount != null
                            ? `${lead.price.amount} ${lead.price.currency ?? ""}`
                            : "—"}
                        </td>
                        <td className="py-2">
                          {lead?.refundable == null ? "—" : lead.refundable ? "Yes" : "No"}
                        </td>
                        <td className="py-2 text-right">
                          {offer.hid != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `rates-${offer.hid}`}
                              onClick={() => void onRates(offer.hid as number)}
                            >
                              Rooms & rates
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {offers && !offers.ok && (
            <p className="text-sm text-destructive">
              {offers.error.code}: {offers.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sandbox validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{report.message}</p>
            {report.partnerOrderId && (
              <p className="font-mono text-xs">
                partner order {report.partnerOrderId} · order {String(report.orderId ?? "—")} · status{" "}
                {report.internalStatus ?? "—"}
              </p>
            )}
            {report.customerPrice && (
              <p className="text-xs text-muted-foreground">
                Supplier cost {report.customerPrice.supplierNet.amount} {report.customerPrice.currency} · markup{" "}
                {report.customerPrice.markupPercent}% ({report.customerPrice.markupAmount}) · fees{" "}
                {report.customerPrice.serviceFeeAmount + report.customerPrice.fixedFee} · customer pays{" "}
                <span className="font-medium text-foreground">
                  {report.customerPrice.customerTotal} {report.customerPrice.currency}
                </span>
              </p>
            )}
            {report.voucher && (
              <p className="text-xs">
                Worldway voucher issued — {report.voucher.worldwayReference} · RateHawk{" "}
                {String(report.voucher.ratehawkOrderId ?? "—")} · {report.voucher.room.name ?? "room"} ·{" "}
                {report.voucher.stay.checkin} → {report.voucher.stay.checkout} ({report.voucher.stay.nights} nights)
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Step</th>
                  <th className="py-2">Endpoint</th>
                  <th className="py-2">HTTP</th>
                  <th className="py-2">Result</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {report.steps.map((s) => (
                  <tr key={s.step} className="border-t">
                    <td className="py-2">{s.step}</td>
                    <td className="py-2 font-mono text-xs">{s.endpoint}</td>
                    <td className="py-2">{s.httpStatus ?? "—"}</td>
                    <td className="py-2">
                      <Badge variant={s.passed ? "default" : "destructive"}>{s.passed ? "PASS" : "FAIL"}</Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <ProductProvenanceTable providerKey="ratehawk" title="RateHawk provenance" />
    </div>
  );
}
