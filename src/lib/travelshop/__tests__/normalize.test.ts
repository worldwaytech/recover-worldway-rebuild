import { describe, expect, it } from "vitest";
import { normalizeTour, stripHtml } from "../normalize";

const raw = {
  id: 7376, slug: "daily-tour", name: "City Tour", status: "active", b2c: true,
  description: "<p>Great &amp; fun</p>", currency: "EUR", price: 44, min_prv_net_price: 43, is_private: true,
  category: { slug: "city", name: "City Sightseeing" },
  routes: [{ name: "Istanbul", slug: "istanbul" }], location_breadcrumbs: ["Europe", "Turkey"],
  images: [{ main: "https://cdn.example.com/a.jpg" }, { main: "http://insecure/b.jpg" }],
  itineraries: [{ day: 1, title: "Day", description: "<p>Pickup</p>" }],
  included: [{ name: "Guide" }], excluded: [{ name: "Meals" }],
  company: { name: "Operator Co" }, rating: 4.9, reviews_count: 37, duration_days: 1,
};

describe("tour normaliser", () => {
  it("maps core fields and keeps supplier identity in source_ref only", () => {
    const r = normalizeTour(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.tour;
    expect(t.external_id).toBe(7376);
    expect(t.country).toBe("Turkey");
    expect(t.destinations).toEqual(["Istanbul"]);
    expect(t.images).toHaveLength(1);
    expect(t.inclusions).toEqual(["Guide"]);
    expect(t.summary).toBe("Great & fun");
    expect(t.source_ref["companyName"]).toBe("Operator Co");
    const { source_ref: _s, ...pub } = t;
    expect(JSON.stringify(pub)).not.toContain("Operator Co");
  });
  it("is stable: same input gives same hash (dedupe/unchanged detection)", () => {
    const a = normalizeTour(raw), b = normalizeTour({ ...raw });
    expect(a.ok && b.ok && a.tour.content_hash === b.tour.content_hash).toBe(true);
  });
  it("skips records without identity", () => {
    expect(normalizeTour({ name: "x" }).ok).toBe(false);
  });
  it("strips html", () => expect(stripHtml("<b>a</b><br>b")).toBe("a\nb"));
});
