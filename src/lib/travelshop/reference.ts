// Client-safe Worldway references and customer status labels for tour bookings.
// Customers only ever see these — never partner references, names or ids.
export function worldwayTourRef(id: string) {
  return `WWT-${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
export function worldwayReceiptNo(paymentRowId: string) {
  return `WWR-${paymentRowId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
export type CustomerTourStatus = "confirmed" | "processing" | "awaiting_payment" | "needs_attention" | "refunded" | "cancelled";
export function customerTourStatus(s: string): CustomerTourStatus {
  if (s === "supplier_booked" || s === "payment_requested" || s === "confirmed") return "confirmed";
  if (s === "refunded") return "refunded";
  if (s === "cancelled") return "cancelled";
  if (s === "awaiting_supplier_authorization") return "awaiting_payment";
  if (s === "supplier_booking_in_progress") return "processing";
  return "needs_attention"; // failed / uncertain / price_changed → Worldway team follows up
}
export const CUSTOMER_TOUR_STATUS_LABEL: Record<CustomerTourStatus, string> = {
  confirmed: "Confirmed",
  processing: "Confirming",
  awaiting_payment: "Awaiting payment",
  needs_attention: "Worldway team finalising",
  refunded: "Refunded",
  cancelled: "Cancelled",
};
