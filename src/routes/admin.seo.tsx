import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "@/lib/portal-nav";

const checks = [
  { key: "Title", ok: 24, warn: 3, fail: 1 },
  { key: "Description", ok: 22, warn: 5, fail: 1 },
  { key: "Canonical", ok: 26, warn: 1, fail: 1 },
  { key: "OG image", ok: 18, warn: 8, fail: 2 },
  { key: "Structured data", ok: 20, warn: 6, fail: 2 },
];

export const Route = createFileRoute("/admin/seo")({
  head: () => ({ meta: [{ title: "SEO Suite | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Search" title="SEO Suite" intro="Technical SEO dashboard, metadata manager, sitemap and structured-data control." nav={adminNav}>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Indexed pages", value: "128" },
          { label: "Sitemap coverage", value: "97%" },
          { label: "Avg. position", value: "12.4" },
        ].map((k) => (
          <div key={k.label} className="rounded-sm border border-border bg-card p-6">
            <p className="eyebrow">{k.label}</p>
            <p className="mt-2 font-serif text-3xl">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 rounded-sm border border-border bg-card">
        <div className="border-b border-border p-4"><p className="font-serif text-xl">Metadata audit</p></div>
        <ul className="divide-y divide-border text-sm">
          {checks.map((c) => (
            <li key={c.key} className="grid grid-cols-4 items-center gap-4 p-4">
              <span className="font-medium">{c.key}</span>
              <span className="text-emerald-600">✓ {c.ok} pass</span>
              <span className="text-amber-600">! {c.warn} warn</span>
              <span className="text-destructive">✗ {c.fail} fail</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          { t: "Sitemap manager", d: "Regenerate /sitemap.xml, exclude sections, add lastmod." },
          { t: "Robots manager", d: "Edit /robots.txt with staging guardrails and previews." },
          { t: "Structured data", d: "Organisation, Product, Article, BreadcrumbList, FAQPage." },
          { t: "Internal linking", d: "Suggest anchor targets from related destinations & guides." },
          { t: "Page performance", d: "Core Web Vitals — LCP, INP, CLS by template." },
          { t: "Search visibility", d: "GSC integration, impressions/CTR by query & country." },
        ].map((c) => (
          <div key={c.t} className="rounded-sm border border-border bg-card p-5">
            <p className="font-serif text-lg">{c.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </div>
    </PortalShell>
  ),
});
