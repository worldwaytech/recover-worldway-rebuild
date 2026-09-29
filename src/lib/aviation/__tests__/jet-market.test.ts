import { describe, expect, it } from "vitest";
import { JET_AIRPORTS, JET_ROUTES, AIRCRAFT_CATALOGUE, aircraftForDistance, routeBySlug } from "../jet-market";
import { findAirportByCode } from "../airports.server";
import { normaliseSkyEstimate } from "../skyaccess.server";
import { indicativeFor, RATE_SHEET } from "../rate-sheet.server";
import { redactForExternal } from "@/lib/confidentiality/redact";

const COMMERCIAL_OK = /^(CC0|CC BY(-SA)? [0-9.]+( [a-z]{2})?|Public domain|GFDL [0-9.]+|OGL v[0-9.]+)$/;

describe("private jet routes", () => {
  it("has 60 worldwide routes and the featured Indian cities", () => {
    expect(JET_ROUTES.filter((r) => r.group === "global")).toHaveLength(60);
    const india = new Set(JET_ROUTES.filter((r) => r.group === "india").flatMap((r) => [r.from, r.to]));
    for (const c of ["ATQ", "AIP", "LUH", "IXC", "IXJ", "IXL", "DEL", "BOM", "MAA", "BLR", "HYD", "GOX"]) expect(india.has(c)).toBe(true);
  });
  it("every airport exists in the airport master and slugs are unique", () => {
    for (const code of Object.keys(JET_AIRPORTS)) expect(findAirportByCode(code), code).not.toBeNull();
    expect(new Set(JET_ROUTES.map((r) => r.slug)).size).toBe(JET_ROUTES.length);
    expect(routeBySlug("del-ixl")?.distanceNm).toBeGreaterThan(300);
  });
  it("suggests only aircraft whose published range covers the distance", () => {
    const { nonstop } = aircraftForDistance(5000);
    expect(nonstop.length).toBeGreaterThan(0);
    for (const a of nonstop) expect(a.rangeNm!).toBeGreaterThanOrEqual(5500);
  });
});

describe("aircraft catalogue", () => {
  it("every photo is commercially licensed and attributed; every model cites a source", () => {
    for (const a of AIRCRAFT_CATALOGUE) {
      expect(a.source.url).toMatch(/^https:\/\/en\.wikipedia\.org\//);
      if (!a.photo) continue;
      expect(a.photo.license, a.slug).toMatch(COMMERCIAL_OK);
      expect(a.photo.page).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(a.photo.artist.length).toBeGreaterThan(0);
    }
  });
  it("carries no prices", () => {
    expect(JSON.stringify(AIRCRAFT_CATALOGUE)).not.toMatch(/price|hourly|usd|inr/i);
  });
});

describe("pricing separation", () => {
  it("indicative pricing is off until an approved rate sheet exists", () => {
    expect(RATE_SHEET).toHaveLength(0);
    expect(indicativeFor("gulfstream-g650", "Ultra Long Range")).toBeNull();
  });
  it("normalises only real partner ranges", () => {
    const out = normaliseSkyEstimate({
      byCategory: [
        { aircraftCategory: "LIGHT_JET", estimateUsd: { min: 100, max: 200 }, flightDurationMinutes: 60 },
        { aircraftCategory: "HEAVY_JET", estimateUsd: { min: null, max: 5 } },
        { aircraftCategory: "PISTON", estimateUsd: { min: 1, max: 2 } },
      ],
    });
    expect(out).toEqual([{ category: "Light jet", currency: "USD", low: 100, high: 200, durationMin: 60 }]);
  });
  it("partner name never leaves the server", () => {
    expect(JSON.stringify(redactForExternal({ note: "via SkyAccess" }))).not.toMatch(/skyaccess/i);
  });
});
