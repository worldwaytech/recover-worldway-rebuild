/**
 * TTC catalogue importer (maintenance script).
 *
 * Usage:
 *   bun scripts/ttc-import.ts [brand|all] [limitPerBrand] [--refresh]
 *
 * Resumable and idempotent: existing slugs are skipped unless --refresh is
 * passed, and unchanged content is detected by fingerprint.
 */
import { TTC_BRAND_ORDER, isTtcBrand, type TtcBrand } from "../src/lib/ttc/config";
import { importTtcBrand } from "../src/lib/ttc/ingest.server";

const [brandArg = "all", limitArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const refresh = process.argv.includes("--refresh");
const limit = limitArg ? Number(limitArg) : undefined;

const brands: TtcBrand[] =
  brandArg === "all" ? TTC_BRAND_ORDER : isTtcBrand(brandArg) ? [brandArg] : [];
if (brands.length === 0) {
  console.error(`Unknown brand "${brandArg}". Use one of: all, ${TTC_BRAND_ORDER.join(", ")}`);
  process.exit(1);
}

for (const brand of brands) {
  console.log(`\n=== ${brand} ===`);
  const outcome = await importTtcBrand({
    brand,
    ...(limit !== undefined ? { limit } : {}),
    refresh,
    onProgress: ({ processed, total, cursor }) =>
      console.log(`  ${brand}: ${processed}/${total} processed (cursor ${cursor})`),
  });
  console.log(
    `  ${brand} -> status=${outcome.status} discovered=${outcome.discovered} imported=${outcome.imported} updated=${outcome.updated} unchanged=${outcome.unchanged} failed=${outcome.failed}`,
  );
  if (outcome.error) console.log(`  error: ${outcome.error}`);
  for (const failure of outcome.failures.slice(0, 5)) {
    console.log(`  failed: ${failure.url} — ${failure.reason}`);
  }
}
