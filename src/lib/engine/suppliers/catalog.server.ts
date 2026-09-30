// Supplier capability catalogue — SERVER-ONLY (supplier identities never reach browsers).
// Grants reflect recorded evidence only. Adding a supplier = Adapter → entry here
// (capabilities) → normaliser to CanonicalOffer → certification evidence. The core
// package engine never changes.
import type { CapabilityGrant, ComponentKind, SupplierCapability, SupplierReadiness, SupplierRegistration } from "../types";

const g = (env: CapabilityGrant["environment"], certified: boolean, evidence: string, ...caps: SupplierCapability[]): CapabilityGrant[] =>
  caps.map((capability) => ({ capability, environment: env, certified, evidence }));

function entry(supplierKey: string, kinds: ComponentKind[], readiness: SupplierReadiness, reliability: number, grants: CapabilityGrant[]): SupplierRegistration {
  return { supplierKey, kinds, readiness, reliability, grants, capabilities: [...new Set(grants.map((x) => x.capability))] };
}

export const SUPPLIER_CATALOG: SupplierRegistration[] = [
  entry("crystal", ["cruise"], "production", 0.95, [
    ...g("production", true, "Live 169-voyage feed; real production booking 475465 created and cancelled", "search", "availability", "price", "prebook", "book", "cancel"),
    ...g("production", false, "Not exercised in production", "modify", "refund", "voucher"),
  ]),
  entry("up17", ["flight", "stay"], "production", 0.9, [
    ...g("production", true, "Live search DEL→BOM returned 122 fares; live hotel search Mumbai 15–18 Oct 2026 returned 546 priced hotels (29 Sep 2026)", "search", "availability", "price"),
    ...g("production", false, "Booking path live but no certified production booking", "book"),
  ]),
  entry("airiq", ["flight"], "production", 0.8, [
    ...g("production", true, "Live login + search answered", "search", "availability", "price"),
    ...g("production", false, "Booking enabled; no certified production booking; balance/activation external", "book", "voucher"),
  ]),
  entry("viator-merchant", ["activity"], "sandbox", 0.8, g("sandbox", true, "Sandbox lifecycle passed", "search", "availability", "price", "prebook", "book", "cancel", "voucher")),
  entry("viator-affiliate", ["activity"], "production", 0.8, [
    ...g("production", true, "Production API environment configured; live customer activity search", "search", "availability", "price"),
    ...g("production", false, "Key lacks affiliate booking access — booking not certified", "book"),
  ]),
  entry("gadventures", ["activity"], "uat", 0.7, g("uat", false, "Certification evidence gaps", "search", "availability", "price", "book")),
  entry("travelshop", ["activity"], "production", 0.85, [
    ...g("production", true, "Full live catalogue sync 8,345/8,345 tours (835/835 pages); live availability + price verified 30 Sep 2026", "search", "availability", "price"),
    ...g("production", false, "Booking path built but switched off (TRAVELSHOP_BOOKING_ENABLED unset) — no authorised production booking", "book", "status"),
  ]),
  entry("ttc", ["activity"], "uat", 0.6, g("production", false, "Catalogue synced from website; no booking API credentials", "search")),
  entry("hbx-hotels", ["stay"], "uat", 0.8, g("uat", false, "Certification audit open; mTLS certificate missing", "search", "availability", "price", "prebook", "book", "cancel")),
  entry("hbx-transfers", ["transfer"], "uat", 0.7, g("uat", false, "Certification evidence gaps", "search", "availability", "price", "book", "cancel")),
  entry("ratehawk", ["stay"], "uat", 0.7, g("uat", false, "Certification not completed", "search", "availability", "price", "prebook", "book", "cancel")),
  entry("tripsafe", ["insurance"], "uat", 0.6, [
    ...g("uat", true, "UAT search PASS", "search"),
    ...g("uat", false, "Review/book evidence missing", "price", "book"),
  ]),
  entry("tripjack-cabs", ["transfer"], "blocked", 0.2, g("uat", false, "UAT location search returns 503", "search", "price", "book")),
  entry("private-aviation", ["aviation"], "production", 0.8, g("production", true, "Live estimates and confirmation requests (no booking/payment API)", "search", "price")),
  entry("skyaccess", ["aviation"], "uat", 0.5, [
    ...g("production", false, "UNAPPROVED / TEST ONLY — official public MCP answered 29 Sep 2026; backend testing only, no customer pricing until supplier approval + live-data validation", "price"),
    ...g("production", false, "Empty-leg search answered but every departure time equalled the request time — not shown to customers until verified", "search", "availability"),
  ]),
  // Future supplier: interfaces ready, deliberately inactive — no credentials, no inventory.
  entry("amadeus", ["flight"], "disabled", 0, []),
];

/** LIVE = production supplier; PARTIALLY_LIVE = only non-production capabilities; OFF = disabled/blocked. Derived, never promoted. */
export type SupplierLiveStatus = "LIVE" | "PARTIALLY_LIVE" | "OFF";
export function liveStatus(r: SupplierRegistration): SupplierLiveStatus {
  if (r.readiness === "production") return "LIVE";
  if (r.readiness === "disabled" || r.readiness === "blocked" || !(r.grants ?? []).length) return "OFF";
  return "PARTIALLY_LIVE";
}

export function supplierRegistry(): Map<string, SupplierRegistration> {
  return new Map(SUPPLIER_CATALOG.map((r) => [r.supplierKey, r]));
}

export function registrationFor(key: string): SupplierRegistration {
  const r = SUPPLIER_CATALOG.find((x) => x.supplierKey === key);
  if (!r) throw new Error(`Unregistered supplier ${key}`);
  return r;
}
