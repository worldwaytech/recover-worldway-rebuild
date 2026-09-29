import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { RAIL_OPERATOR_RECORDS, RAIL_OPERATOR_TERMS } from "@/lib/rail/rail-operators.server";
import { sanitizeOutbound } from "../guard.server";
import { registerSupplierTerms, redactNames, supplierTerms } from "../redact";
import { collectionItems } from "@/lib/collections";
import { EUROPE_SEEDS } from "@/lib/train-tours/glrep/content/data";

const ROOT = join(__dirname, "../../..");
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const opRe = new RegExp(`(?<![\\w-])(${RAIL_OPERATOR_TERMS.map(esc).join("|")})(?![\\w-])`, "i");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.server\.|__tests__/.test(p) ? [p] : [];
  });
}

describe("rail operator confidentiality", () => {
  it("keeps real operators only in the server-side record", () => {
    expect(RAIL_OPERATOR_RECORDS.length).toBeGreaterThan(0);
    expect(RAIL_OPERATOR_TERMS).toContain("Belmond");
  });

  it("customer rail content uses only the neutral operator label", () => {
    const items = (collectionItems as Record<string, { operator?: string; title: string; subtitle?: string }[]>).rail;
    for (const i of items) {
      expect(i.operator).toBe("Worldway Rail");
      expect(`${i.title} ${i.subtitle ?? ""}`).not.toMatch(opRe);
    }
    for (const s of EUROPE_SEEDS) expect(s.operatorName).toBe("Worldway Rail");
  });

  it("no rail operator name appears in rail/train page code or content", () => {
    const files = [
      ...walk(join(ROOT, "lib/train-tours")),
      ...walk(join(ROOT, "components/train-tours")),
      ...walk(join(ROOT, "routes")).filter((f) => /rail|train/.test(relative(ROOT, f)) && !/admin/.test(f)),
    ];
    const leaks: string[] = [];
    for (const f of files)
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        const strs = [...l.matchAll(/"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "")
          .filter((s) => !/^[a-z0-9-]+$/.test(s)); // URL slugs are allowed
        if (strs.some((s) => opRe.test(s))) leaks.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    expect(leaks).toEqual([]);
  });

  it("filters rail operators from outbound browser/API/MCP payloads", async () => {
    const out = JSON.stringify(await sanitizeOutbound({ journey: { title: "Belmond Royal Scotsman", note: "Operated by Rovos Rail" } }));
    for (const t of ["Belmond", "Rovos"]) expect(out).not.toMatch(new RegExp(t, "i"));
  });

  it("automatically covers future suppliers once registered", () => {
    registerSupplierTerms(["Aurora Future Rail Co"]);
    expect(supplierTerms()).toContain("Aurora Future Rail Co");
    expect(redactNames("Booked with Aurora Future Rail Co")).not.toMatch(/Aurora Future Rail Co/);
  });
});
