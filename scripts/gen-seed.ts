import { collectionItems, collectionsMeta } from "../src/lib/collections";
import { images } from "../src/lib/data-images";
const rev = new Map<string,string>();
for (const [k,v] of Object.entries(images)) rev.set(String(v), k);
const esc = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const arr = (a?: string[]) => a && a.length ? "ARRAY[" + a.map(esc).join(",") + "]::text[]" : "'{}'::text[]";
const rows: string[] = [];
for (const [kind, items] of Object.entries(collectionItems)) {
  const meta = (collectionsMeta as any)[kind];
  items.forEach((i: any, idx: number) => {
    rows.push(`(${esc(kind)},${esc(i.slug)},${esc(i.title)},${esc(i.subtitle)},${esc(i.location)},${i.region?esc(i.region):"NULL"},${esc(rev.get(String(i.image)) ?? "hero")},${i.priceFrom ?? "NULL"},${esc(i.priceUnit ?? "per guest")},${i.duration?esc(i.duration):"NULL"},${i.capacity?esc(i.capacity):"NULL"},${i.operator?esc(i.operator):"NULL"},${arr(i.highlights)},${arr(i.inclusions)},${arr(i.tags)},${i.featured?"true":"false"},${esc(meta.detailBasePath)},${idx})`);
  });
}
console.log(rows.join(",\n"));
