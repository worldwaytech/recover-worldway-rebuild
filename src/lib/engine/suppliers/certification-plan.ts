// Evidence-driven certification plan for currently registered suppliers.
// This does not change liveStatus. Production promotion still requires the
// existing supplier registry grants to be updated only after real evidence.

export type CertificationNextStep =
  | "complete_production_booking"
  | "complete_contract_prerequisites"
  | "complete_supplier_credentials"
  | "complete_mtls"
  | "resolve_upstream_outage"
  | "maintain_current_scope"
  | "defer";

export interface SupplierCertificationPlan {
  supplierKey: string;
  currentReadiness: "production" | "uat" | "sandbox" | "blocked" | "disabled";
  nextStep: CertificationNextStep;
  requiredEvidence: readonly string[];
  promotionBlocker: string;
}

export const SUPPLIER_CERTIFICATION_PLAN: readonly SupplierCertificationPlan[] = [
  { supplierKey: "travelgate", currentReadiness: "disabled", nextStep: "complete_contract_prerequisites", requiredEvidence: ["Travelgate API credentials", "test Search", "test Quote", "test Book", "test Booking Read", "test Cancel", "failure/retry evidence", "idempotency evidence", "production lifecycle evidence"], promotionBlocker: "Integration foundation exists, but Travelgate has no production certification evidence and remains inactive." },
  { supplierKey: "travelshop", currentReadiness: "production", nextStep: "complete_contract_prerequisites", requiredEvidence: ["partner country IDs", "paid production booking", "cancel/refund outcome"], promotionBlocker: "Booking is not production-certified until partner prerequisites and a paid end-to-end booking are evidenced." },
  { supplierKey: "ratehawk", currentReadiness: "uat", nextStep: "complete_production_booking", requiredEvidence: ["credentials", "search", "price/rate validation", "prebook", "production booking", "booking read/status", "cancel/refund", "failure/retry evidence", "idempotency evidence"], promotionBlocker: "Certification is incomplete; RateHawk remains UAT until the complete production lifecycle is evidenced and the supplier promotion gates are satisfied." },
  { supplierKey: "gadventures", currentReadiness: "uat", nextStep: "complete_production_booking", requiredEvidence: ["supplier write access", "search", "availability", "booking scope", "booking", "booking read", "confirmation requirements", "cancellation", "failure/retry evidence", "idempotency evidence"], promotionBlocker: "Current application key is read-only for booking resources; supplier authorization and complete production lifecycle evidence are still required." },
  { supplierKey: "hbx-hotels", currentReadiness: "uat", nextStep: "complete_mtls", requiredEvidence: ["valid mTLS certificate", "mTLS test endpoint connectivity", "availability/price", "CheckRate", "booking", "booking read/detail", "cancel", "change/reconfirmation where applicable"], promotionBlocker: "mTLS transport foundation is implemented; HBX TEST evidence and production certification are still required." },
  { supplierKey: "hbx-transfers", currentReadiness: "uat", nextStep: "complete_production_booking", requiredEvidence: ["credentials", "search", "price", "book", "booking read", "cancel", "failure/retry evidence", "idempotency evidence"], promotionBlocker: "Certification foundation is implemented; HBX TEST booking lifecycle, cancellation, resilience and idempotency evidence are still required before production promotion." },
  { supplierKey: "viator-affiliate", currentReadiness: "production", nextStep: "complete_supplier_credentials", requiredEvidence: ["affiliate booking entitlement", "paid production booking", "cancel/refund outcome"], promotionBlocker: "Current key is not certified for affiliate booking." },
  { supplierKey: "up17", currentReadiness: "production", nextStep: "complete_production_booking", requiredEvidence: ["production booking", "cancel/modify outcome", "idempotency evidence"], promotionBlocker: "Search/availability/price are evidenced; production booking is not certified." },
  { supplierKey: "airiq", currentReadiness: "production", nextStep: "complete_production_booking", requiredEvidence: ["production booking", "voucher/status", "failure/retry evidence"], promotionBlocker: "Booking remains uncertified in production." },
  { supplierKey: "tripjack-cabs", currentReadiness: "blocked", nextStep: "resolve_upstream_outage", requiredEvidence: ["stable location search", "price", "book", "cancel"], promotionBlocker: "UAT location search returns 503." },
  { supplierKey: "private-aviation", currentReadiness: "production", nextStep: "maintain_current_scope", requiredEvidence: ["future booking/payment API if offered"], promotionBlocker: "Current scope is enquiry/estimate; no booking/payment API is certified." },
  { supplierKey: "skyaccess", currentReadiness: "uat", nextStep: "complete_supplier_credentials", requiredEvidence: ["supplier approval", "live pricing", "verified departure times", "production certification"], promotionBlocker: "Unapproved/test-only status and unresolved data-quality evidence." },
  { supplierKey: "amadeus", currentReadiness: "disabled", nextStep: "defer", requiredEvidence: ["commercial/API access", "coverage comparison", "normalization audit", "production certification"], promotionBlocker: "Explicitly deferred pending this reassessment and access evidence." },
];

export function certificationPlanFor(supplierKey: string): SupplierCertificationPlan {
  const plan = SUPPLIER_CERTIFICATION_PLAN.find((item) => item.supplierKey === supplierKey);
  if (!plan) throw new Error(`Certification plan not found: ${supplierKey}`);
  return plan;
}
