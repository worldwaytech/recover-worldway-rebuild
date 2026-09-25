// Supplier manifest — single place where a supplier declares itself.
//
// Every entry here is automatically seeded into `integration_providers`, and
// therefore appears in API Management, the Sync Center, health monitoring and
// the Super Admin dashboard with no screen changes. Probes are READ-ONLY and
// never create bookings. Where a supplier documents no read-only endpoint, the
// probe reports that honestly instead of claiming the supplier is connected.
import type { AdapterProbe, SupplierAdapter } from "./adapters.server";

type Row = Record<string, unknown>;

async function timed(url: string, init: RequestInit): Promise<{ status: number; ok: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(t);
  }
}

function missing(names: string[]): string[] {
  return names.filter((n) => !(process.env[n] ?? "").trim());
}

function credentialOnly(id: string, label: string, secrets: string[], note: string): SupplierAdapter {
  return {
    id,
    label,
    async probe(): Promise<AdapterProbe> {
      const m = missing(secrets);
      if (m.length) return { ok: false, status: null, detail: `NOT CONNECTED — missing ${m.join(", ")}.` };
      return { ok: false, status: null, detail: `Credentials configured. ${note}` };
    },
    async fetchAll() {
      return { records: [], live: false, warnings: [`${label} is a live-search supplier; no static catalogue is synchronised.`] };
    },
  };
}

function probeAdapter(
  id: string,
  label: string,
  secrets: string[],
  run: () => Promise<{ status: number; ok: boolean }>,
): SupplierAdapter {
  return {
    id,
    label,
    async probe() {
      const m = missing(secrets);
      if (m.length) return { ok: false, status: null, detail: `NOT CONNECTED — missing ${m.join(", ")}.` };
      const r = await run();
      return { ok: r.ok, status: r.status, detail: r.ok ? `Read-only probe HTTP ${r.status}.` : `Probe returned HTTP ${r.status}.` };
    },
    async fetchAll() {
      return { records: [], live: false, warnings: [`${label} has no static catalogue synchronised by this engine.`] };
    },
  };
}

export const MANIFEST_ADAPTERS: SupplierAdapter[] = [
  probeAdapter("viator-merchant", "Viator Merchant — sandbox", ["VIATOR_SANDBOX_API_KEY"], () =>
    timed("https://api.sandbox.viator.com/partner/products/tags", {
      headers: {
        "exp-api-key": process.env["VIATOR_SANDBOX_API_KEY"] ?? "",
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
      },
    }),
  ),
  probeAdapter("firecrawl", "Firecrawl web intelligence", ["FIRECRAWL_API_KEY"], () =>
    timed("https://api.firecrawl.dev/v1/team/credit-usage", {
      headers: { Authorization: `Bearer ${process.env["FIRECRAWL_API_KEY"] ?? ""}` },
    }),
  ),
  probeAdapter("razorpay", "Razorpay payments", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"], () =>
    timed("https://api.razorpay.com/v1/payments?count=1", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env["RAZORPAY_KEY_ID"]}:${process.env["RAZORPAY_KEY_SECRET"]}`).toString("base64")}`,
      },
    }),
  ),
  credentialOnly("up17", "UP17 flights/hotels/buses", ["UP17_USERNAME", "UP17_PASSWORD"], "No read-only health endpoint is documented; verify via a live search."),
  credentialOnly("tripjack-cabs", "TripJack Cabs (UAT)", ["TRIPJACK_UAT_API_KEY"], "UAT only; verify via certification page."),
  credentialOnly("tripjack-tripsafe", "TripJack TripSafe (UAT)", ["TRIPJACK_UAT_API_KEY"], "UAT only; verify via certification page."),
  credentialOnly("bokun", "Bókun / OCTO marketplace", ["BOKUN_ACCESS_KEY", "BOKUN_SECRET_KEY"], "Use the Bókun admin page for environment probe and sync."),
  credentialOnly("airiq", "AIRIQ", ["AIRIQ_API_KEY"], "No AIRIQ documentation has been provided; integration is not built."),
];

export const MANIFEST_SEEDS: Row[] = [
  { provider_key: "viator-merchant", name: "Viator Merchant (Sandbox)", category: "experiences", summary: "Merchant API sandbox: hold, book, status, cancel.", base_url: "https://api.sandbox.viator.com/partner", auth_kind: "api-key-header", auth_header: "exp-api-key", secret_names: ["VIATOR_SANDBOX_API_KEY"], endpoints: {}, capabilities: ["catalog", "availability", "booking", "cancellation"], collections: ["merchant"], sync_strategy: "full", contract_status: "sandbox", adapter: "viator-merchant" },
  { provider_key: "up17", name: "UP17", category: "flights", summary: "Flights, hotels and buses — live search.", base_url: "", auth_kind: "header-pair", secret_names: ["UP17_USERNAME", "UP17_PASSWORD"], endpoints: {}, capabilities: ["availability", "pricing", "booking"], collections: ["flights", "buses"], sync_strategy: "full", contract_status: "signed", adapter: "up17" },
  { provider_key: "tripjack-cabs", name: "TripJack Cabs", category: "transfers", summary: "Cab search and booking (UAT).", base_url: "https://apitest.tripjack.com", auth_kind: "api-key-header", auth_header: "apikey", secret_names: ["TRIPJACK_UAT_API_KEY"], endpoints: {}, capabilities: ["availability", "booking", "cancellation"], collections: ["cabs"], sync_strategy: "full", contract_status: "uat", adapter: "tripjack-cabs" },
  { provider_key: "tripjack-tripsafe", name: "TripJack TripSafe", category: "insurance", summary: "Travel insurance quotes and policies (UAT).", base_url: "https://apitest.tripjack.com", auth_kind: "api-key-header", auth_header: "apikey", secret_names: ["TRIPJACK_UAT_API_KEY"], endpoints: {}, capabilities: ["pricing", "booking"], collections: ["insurance"], sync_strategy: "full", contract_status: "uat", adapter: "tripjack-tripsafe" },
  { provider_key: "bokun", name: "Bókun Marketplace", category: "experiences", summary: "Bókun REST + OCTO marketplace (booking gated).", base_url: "https://api.bokun.io", auth_kind: "signed-session", secret_names: ["BOKUN_ACCESS_KEY", "BOKUN_SECRET_KEY"], endpoints: {}, capabilities: ["catalog", "availability"], collections: ["marketplace"], sync_strategy: "full", contract_status: "signed", adapter: "bokun" },
  { provider_key: "razorpay", name: "Razorpay", category: "payments", summary: "Customer payment gateway and webhooks.", base_url: "https://api.razorpay.com", auth_kind: "basic", secret_names: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"], endpoints: {}, capabilities: ["payments"], collections: [], sync_strategy: "full", contract_status: "signed", adapter: "razorpay", webhook_secret_name: "RAZORPAY_WEBHOOK_SECRET" },
  { provider_key: "firecrawl", name: "Firecrawl Web Intelligence", category: "web-intelligence", summary: "Content crawling for tour catalogue enrichment.", base_url: "https://api.firecrawl.dev", auth_kind: "bearer-token", secret_names: ["FIRECRAWL_API_KEY"], endpoints: {}, capabilities: ["content"], collections: ["ttc"], sync_strategy: "full", contract_status: "signed", adapter: "firecrawl" },
  { provider_key: "airiq", name: "AIRIQ", category: "flights", summary: "Not built — awaiting API documentation and credentials.", base_url: "", auth_kind: "none", secret_names: ["AIRIQ_API_KEY"], endpoints: {}, capabilities: [], collections: [], sync_strategy: "full", contract_status: "prospective", adapter: "airiq", enabled: false },
];
