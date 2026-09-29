// Real rail/train operator identities — SERVER-ONLY (Admin/Ops/Super Admin).
// Customer content uses the neutral "Worldway Rail" label; these names are
// registered with the privacy filter so they are redacted from every browser,
// B2B, API and MCP payload. Add future rail operators here.
export interface RailOperatorRecord { product: string; operator: string; train?: string }

export const RAIL_OPERATOR_RECORDS: readonly RailOperatorRecord[] = [
  { product: "venice-simplon-orient-express", operator: "Belmond", train: "Venice Simplon-Orient-Express" },
  { product: "golden-eagle-danube-express", operator: "Golden Eagle Luxury Trains", train: "Golden Eagle Danube Express" },
  { product: "balkan-explorer", operator: "Golden Eagle Luxury Trains", train: "Golden Eagle Danube Express" },
  { product: "grand-alpine-journey", operator: "Golden Eagle Luxury Trains", train: "Alpine Pullman" },
  { product: "italian-lakes-grand-tour", operator: "Belmond", train: "Belmond Grand Tour" },
  { product: "highlands-of-scotland", operator: "Belmond Royal Scotsman", train: "Belmond Royal Scotsman" },
  { product: "spanish-andalusian-express", operator: "Renfe (Al Andalus)", train: "Al Andalus" },
  { product: "silk-road-europe-extension", operator: "Golden Eagle Luxury Trains", train: "Golden Eagle" },
  { product: "qinghai-tibet-railway", operator: "Tangula Luxury Trains", train: "Tangula Express" },
  { product: "ancient-china-by-private-train", operator: "Golden Eagle Luxury Trains", train: "Shangri-La Express" },
  { product: "silk-road-expedition", operator: "Golden Eagle Luxury Trains", train: "Shangri-La Express" },
  { product: "dunhuang-gobi-discovery", operator: "Golden Eagle Luxury Trains", train: "Shangri-La Express" },
  { product: "imperial-capitals", operator: "Golden Eagle Luxury Trains", train: "Shangri-La Express" },
  { product: "lhasa-himalaya-approach", operator: "Tangula Luxury Trains", train: "Tangula Express" },
  { product: "vsoe-paris-venice", operator: "Belmond" },
  { product: "royal-scotsman", operator: "Belmond" },
  { product: "rovos-pride-of-africa", operator: "Rovos Rail" },
  { product: "maharajas-express", operator: "IRCTC" },
  { product: "rocky-mountaineer-first-passage", operator: "Rocky Mountaineer" },
  { product: "seven-stars-kyushu", operator: "JR Kyushu" },
];

/** Operator brand terms redacted from all external responses. */
export const RAIL_OPERATOR_TERMS: readonly string[] = ["Belmond", "Belmond Royal Scotsman", "Golden Eagle", "Golden Eagle Luxury Trains", "IRCTC", "JR Kyushu", "Renfe", "Renfe (Al Andalus)", "Rocky Mountaineer", "Rovos", "Rovos Rail", "Tangula", "Tangula Luxury Trains"];

export function railOperatorFor(productSlug: string): RailOperatorRecord | undefined {
  return RAIL_OPERATOR_RECORDS.find((r) => r.product === productSlug);
}
