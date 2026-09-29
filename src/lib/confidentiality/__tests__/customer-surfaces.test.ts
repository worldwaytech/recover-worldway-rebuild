import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { supplierTerms, redactForExternal, findSupplierLeaks } from "../redact";
import { mediaUrl, decodeMediaToken } from "@/lib/media";

const ROOT = join(__dirname, "../../..");
// Operator/brand names shown through supplier content (in addition to registry terms).
const BRAND_TERMS = ["Contiki", "Trafalgar", "Insight Vacations", "Luxury Gold", "Costsaver", "AAT Kings", "Brendan Vacations", "Travel Corporation", "Crystal Cruises", "Abercrombie"];
const SHORT_OK = new Set(["etg", "octo", "a&k"]); // too generic for source scans

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const customerFiles = [...walk(join(ROOT, "routes")), ...walk(join(ROOT, "components"))].filter((f) => {
  const r = relative(ROOT, f);
  return !/admin/i.test(r) && !r.startsWith("routes/api/");
});

describe("customer surfaces", () => {
  const terms = [...supplierTerms(), ...BRAND_TERMS].filter((t) => t.length > 2 && !SHORT_OK.has(t.toLowerCase()));
  const re = new RegExp(`(?<![\\w-])(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "i");

  it("show no supplier or operator brand names in visible text", () => {
    const leaks: string[] = [];
    for (const f of customerFiles) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const t = line.trim();
        if (/^(import|\/\/|\*|\/\*)/.test(t) || t.includes("confidentiality-exempt") || t.includes("data-testid")) return;
        // Only string literals / JSX text — identifiers and paths are not visible copy.
        const visible = [...t.matchAll(/"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)]
          .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
          .filter((s) => !/^[/@.]|^[a-z0-9-]+$/.test(s));
        if (visible.some((s) => re.test(s))) leaks.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(leaks).toEqual([]);
  });

  it("serve every dynamic image through the Worldway media URL", () => {
    const bad: string[] = [];
    for (const f of customerFiles) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/<img\b[\s\S]*?\ssrc=\{([\s\S]*?)\}(?=[\s/>])/g))
        if (!m[1].trim().startsWith("mediaUrl(")) bad.push(`${relative(ROOT, f)}: ${m[1].trim().slice(0, 40)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("media URLs", () => {
  it("hide supplier domains and round-trip", () => {
    const u = "https://photos.hotelbeds.com/giata/bigger/12/123.jpg";
    const m = mediaUrl(u)!;
    expect(m).toMatch(/^\/media\/[A-Za-z0-9_-]+$/);
    expect(m).not.toMatch(/hotelbeds/i);
    expect(decodeMediaToken(m.slice(7))).toBe(u);
    expect(mediaUrl("/assets/a.jpg")).toBe("/assets/a.jpg");
  });
  it("API/MCP payload image URLs become neutral Worldway URLs", () => {
    const out = redactForExternal({ image: "https://cdn.tboholidays.com/x/y.jpg", link: "https://api.somefuturesupplier.io/v1/deal" });
    expect(String((out as any).image)).toMatch(/^https:\/\/worldwaytravelsgroup\.com\/media\//);
    expect((out as any).link).toBe("[worldway]");
    expect(findSupplierLeaks(out)).toEqual([]);
  });
});
