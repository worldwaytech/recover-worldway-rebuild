import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { redactForExternal, findSupplierLeaks, redactText, supplierTerms } from "../redact";
import { PARTNER_CONNECTORS } from "@/lib/partners/registry";

describe("supplier confidentiality", () => {
  it("strips supplier metadata keys and names", () => {
    const out = redactForExternal({
      ok: true,
      supplier: "hbx", supplierKey: "up17", provider: "Viator", adapter: "airiq",
      outcomes: [{ supplierKey: "up17" }], routing: {}, endpoint: "https://api.hotelbeds.com/x",
      offers: [{ title: "Fare via TripJack", note: "see https://travelapi.up17.in/img.jpg", price: 10 }],
      error: "RateHawk returned 503",
    });
    expect(findSupplierLeaks(out)).toEqual([]);
    expect(out).toMatchObject({ ok: true, offers: [{ price: 10 }] });
    expect((out as any).error).toBe("Worldway returned 503");
  });

  it("covers every registered (incl. future) supplier automatically", () => {
    const terms = supplierTerms().map((t) => t.toLowerCase());
    for (const c of PARTNER_CONNECTORS) expect(terms).toContain(c.name.toLowerCase());
    for (const c of PARTNER_CONNECTORS) expect(findSupplierLeaks(redactForExternal({ t: `Booked with ${c.name}` }))).toEqual([]);
  });

  it("leaves ordinary travel content intact", () => {
    expect(redactText("Air India Express IX1165 DEL→BOM")).toBe("Air India Express IX1165 DEL→BOM");
  });

  it("every MCP tool returns through the confidentiality layer", () => {
    const dir = join(__dirname, "../../mcp/tools");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      if (!src.includes("structuredContent") && !src.includes("externalToolResult")) continue;
      expect(src, f).toContain("externalToolResult");
      expect(src, f).not.toMatch(/structuredContent:\s*res\b/);
    }
  });

  it("flight offers use opaque Worldway ids", () => {
    const src = readFileSync(join(__dirname, "../../flights/flight-adapters.server.ts"), "utf8");
    expect(src).not.toMatch(/WWF-[AB]-/);
  });
});
