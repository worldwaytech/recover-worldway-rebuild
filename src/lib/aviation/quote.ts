// Pure Worldway Private Aviation quote / payment / receipt / email logic (no I/O).

export const PAYABLE_CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED"] as const;
export type PayableCurrency = (typeof PAYABLE_CURRENCIES)[number];

export type QuoteRow = {
  reference: string;
  user_id: string | null;
  status: string;
  quote_amount: number | string | null;
  quote_currency: string | null;
  quote_expires_at: string | null;
  quote_version: number;
  paid_at: string | null;
};

export type PayCheck =
  | { ok: true; amountMinor: number; currency: string; version: number }
  | { ok: false; error: string };

/** Server-authoritative check that a confirmed quote can be paid by this user now. */
export function checkQuotePayable(row: QuoteRow | null, userId: string | null, now = new Date()): PayCheck {
  if (!row || !userId || row.user_id !== userId) return { ok: false, error: "This quote can't be paid." };
  if (row.paid_at || row.status === "paid" || row.status === "booked") return { ok: false, error: "This quote has already been paid." };
  if (row.status !== "quoted") return { ok: false, error: "Your confirmed quote isn't ready yet." };
  const amount = Number(row.quote_amount);
  const currency = String(row.quote_currency ?? "").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "This quote has no valid price." };
  if (!(PAYABLE_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: "This quote currency can't be paid online." };
  if (row.quote_expires_at && new Date(row.quote_expires_at).getTime() <= now.getTime()) {
    return { ok: false, error: "This quote has expired. Please ask our aviation desk to reconfirm it." };
  }
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) return { ok: false, error: "This quote has no valid price." };
  return { ok: true, amountMinor, currency, version: row.quote_version };
}

export function receiptNumber(reference: string, paidAt: Date): string {
  const d = paidAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `WWPA-RCPT-${d}-${reference.slice(-6)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Received",
  sourcing: "Sourcing aircraft",
  options_sent: "Options being prepared",
  quoted: "Confirmed quote ready",
  paid: "Paid",
  booked: "Booked",
  closed: "Closed",
  failed: "Desk follow-up",
};

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailKind = "request_received" | "quote_ready" | "payment_receipt";

export type EmailInput = {
  kind: EmailKind;
  reference: string;
  customerName: string;
  route: string;
  departureDate: string | null;
  passengers: number;
  aircraft?: string | null;
  amount?: number | null;
  currency?: string | null;
  receiptNumber?: string | null;
  paymentId?: string | null;
  expiresAt?: string | null;
  link: string;
};

/** Worldway-branded email. Never contains partner names, links or IDs. */
export function renderAviationEmail(i: EmailInput): { subject: string; html: string; text: string } {
  const price = i.amount != null && i.currency ? formatMoney(i.amount, i.currency) : null;
  const subject =
    i.kind === "request_received"
      ? `Worldway Private Aviation — request ${i.reference} received`
      : i.kind === "quote_ready"
        ? `Your confirmed private jet quote ${i.reference}`
        : `Receipt ${i.receiptNumber} — Worldway Private Aviation`;
  const intro =
    i.kind === "request_received"
      ? "Thank you. Our Private Aviation desk is sourcing vetted operators for your trip and will send your confirmed quote shortly."
      : i.kind === "quote_ready"
        ? `Your confirmed quote is ready${price ? `: ${price}` : ""}. Review and pay securely from your Worldway account.${i.expiresAt ? ` This quote is valid until ${new Date(i.expiresAt).toUTCString()}.` : ""}`
        : `We've received your payment${price ? ` of ${price}` : ""}. Your private jet is now being booked by our Private Aviation desk.`;
  const rows: [string, string][] = [
    ["Worldway reference", i.reference],
    ["Route", i.route],
    ["Departure", i.departureDate ?? "To be confirmed"],
    ["Passengers", String(i.passengers)],
    ...(i.aircraft ? ([["Aircraft", i.aircraft]] as [string, string][]) : []),
    ...(price ? ([[i.kind === "payment_receipt" ? "Amount paid" : "Price", price]] as [string, string][]) : []),
    ...(i.receiptNumber ? ([["Receipt number", i.receiptNumber]] as [string, string][]) : []),
    ...(i.paymentId ? ([["Payment ID", i.paymentId]] as [string, string][]) : []),
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Georgia,serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="letter-spacing:4px;font-size:12px;color:#B8912F">WORLDWAY PRIVATE AVIATION</div>
<h1 style="font-weight:normal;font-size:24px;margin:16px 0">Dear ${esc(i.customerName)},</h1>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${esc(intro)}</p>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:20px 0">
${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#666;border-bottom:1px solid #eee">${esc(k)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${esc(v)}</td></tr>`).join("")}
</table>
<a href="${esc(i.link)}" style="display:inline-block;background:#B8912F;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:24px;font-family:Arial,sans-serif;font-size:13px">View in your Worldway account</a>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:32px">Worldway Travels Group · aviation@worldwaytravelsgroup.com</p>
</div></body></html>`;
  const text = [`Dear ${i.customerName},`, "", intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", i.link, "", "Worldway Travels Group"].join("\n");
  return { subject, html, text };
}
