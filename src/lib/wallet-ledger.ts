// Enterprise wallet ledger (localStorage-backed demo).
// Persists top-ups, spends, refunds, promo credits, and notifications per user.
// Keeps partner-API top-up flow intact — this augments it with an auditable
// client-side ledger so filters, analytics, statements, and refunds all work
// without a backend. Migrate to Lovable Cloud when enabled.

export type LedgerKind = "topup" | "spend" | "refund" | "bonus" | "adjustment";
export type LedgerStatus = "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
export type Gateway = "razorpay" | "paypal" | "wallet" | "promo" | "manual";
export type Supplier =
  | "hotels"
  | "flights"
  | "activities"
  | "transfers"
  | "cruises"
  | "rail"
  | "private_jets"
  | "packages"
  | "buses"
  | "other";

export type LedgerEntry = {
  id: string; // internal txn id (WWL-xxxx)
  userEmail: string;
  kind: LedgerKind;
  status: LedgerStatus;
  amount: number; // signed: credits +, debits −
  currency: string;
  gateway: Gateway;
  gatewayTxnId?: string;
  method?: string; // upi, card, netbanking, wallet, paypal_balance, etc.
  fee?: number; // gateway fee (display only — client absorbs)
  tax?: number; // GST/VAT on fee
  netCredit?: number; // net into wallet after fee
  fxRate?: number;
  supplier?: Supplier;
  bookingRef?: string;
  description: string;
  createdAt: string; // ISO
  settledAt?: string;
  refundOf?: string; // parent ledger id
  invoiceNumber?: string;
};

export type WalletNotification = {
  id: string;
  userEmail: string;
  kind: "topup_success" | "topup_failed" | "refund" | "low_balance" | "promo" | "info";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type PromoCredit = {
  id: string;
  userEmail: string;
  amount: number;
  currency: string;
  label: string;
  expiresAt: string;
  used: boolean;
};

const LEDGER_KEY = "wwtg:wallet:ledger";
const NOTIF_KEY = "wwtg:wallet:notifications";
const PROMO_KEY = "wwtg:wallet:promos";
const SHORTFALL_KEY = "wwtg:wallet:shortfall"; // pending checkout return

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    return JSON.parse(localStorage.getItem(k) || "") as T;
  } catch {
    return fb;
  }
}
function write(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}
function rid(prefix = "WWL") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ----- Ledger -----
export const ledger = {
  all(userEmail: string): LedgerEntry[] {
    return read<LedgerEntry[]>(LEDGER_KEY, [])
      .filter((e) => e.userEmail.toLowerCase() === userEmail.toLowerCase())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
  append(
    e: Omit<LedgerEntry, "id" | "createdAt" | "invoiceNumber"> & {
      id?: string;
      createdAt?: string;
    },
  ): LedgerEntry {
    const rec: LedgerEntry = {
      id: e.id ?? rid("WWL"),
      createdAt: e.createdAt ?? new Date().toISOString(),
      invoiceNumber: `INV-${Date.now().toString().slice(-8)}`,
      ...e,
    };
    const all = read<LedgerEntry[]>(LEDGER_KEY, []);
    all.push(rec);
    write(LEDGER_KEY, all);
    return rec;
  },
  update(id: string, patch: Partial<LedgerEntry>) {
    const all = read<LedgerEntry[]>(LEDGER_KEY, []);
    const i = all.findIndex((x) => x.id === id);
    if (i >= 0) {
      all[i] = { ...all[i], ...patch };
      write(LEDGER_KEY, all);
    }
  },
  balance(userEmail: string, currency: string): number {
    return this.all(userEmail)
      .filter(
        (e) =>
          e.currency === currency &&
          (e.status === "succeeded" || e.status === "partially_refunded"),
      )
      .reduce((s, e) => s + e.amount, 0);
  },
  refund(parentId: string, opts?: { partial?: number; reason?: string }) {
    const all = read<LedgerEntry[]>(LEDGER_KEY, []);
    const p = all.find((x) => x.id === parentId);
    if (!p || p.kind !== "spend") return null;
    const refundAmt = Math.abs(opts?.partial ?? p.amount);
    const rec = this.append({
      userEmail: p.userEmail,
      kind: "refund",
      status: "succeeded",
      amount: refundAmt,
      currency: p.currency,
      gateway: "wallet",
      supplier: p.supplier,
      bookingRef: p.bookingRef,
      refundOf: parentId,
      description: `Refund${opts?.reason ? ` — ${opts.reason}` : ""} · ${p.description}`,
      settledAt: new Date().toISOString(),
    });
    this.update(parentId, {
      status:
        opts?.partial && opts.partial < Math.abs(p.amount) ? "partially_refunded" : "refunded",
    });
    notif.push({
      userEmail: p.userEmail,
      kind: "refund",
      title: "Refund credited to wallet",
      body: `${new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(refundAmt)} refunded for ${p.description}.`,
    });
    return rec;
  },
};

// ----- Notifications -----
export const notif = {
  all(userEmail: string): WalletNotification[] {
    return read<WalletNotification[]>(NOTIF_KEY, [])
      .filter((n) => n.userEmail.toLowerCase() === userEmail.toLowerCase())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
  push(n: Omit<WalletNotification, "id" | "createdAt" | "read">) {
    const all = read<WalletNotification[]>(NOTIF_KEY, []);
    all.push({ ...n, id: rid("NTF"), read: false, createdAt: new Date().toISOString() });
    write(NOTIF_KEY, all);
  },
  markAllRead(userEmail: string) {
    const all = read<WalletNotification[]>(NOTIF_KEY, []);
    write(
      NOTIF_KEY,
      all.map((n) =>
        n.userEmail.toLowerCase() === userEmail.toLowerCase() ? { ...n, read: true } : n,
      ),
    );
  },
};

// ----- Promo credits -----
export const promo = {
  active(userEmail: string, currency: string): PromoCredit[] {
    const now = Date.now();
    return read<PromoCredit[]>(PROMO_KEY, []).filter(
      (p) =>
        p.userEmail.toLowerCase() === userEmail.toLowerCase() &&
        p.currency === currency &&
        !p.used &&
        new Date(p.expiresAt).getTime() > now,
    );
  },
  grant(p: Omit<PromoCredit, "id" | "used">) {
    const all = read<PromoCredit[]>(PROMO_KEY, []);
    all.push({ ...p, id: rid("PROMO"), used: false });
    write(PROMO_KEY, all);
  },
};

// ----- Shortfall (low-balance assistant) -----
export type Shortfall = { amount: number; currency: string; returnTo: string; label: string };
export const shortfall = {
  set(s: Shortfall) {
    write(SHORTFALL_KEY, s);
  },
  get(): Shortfall | null {
    return read<Shortfall | null>(SHORTFALL_KEY, null);
  },
  clear() {
    write(SHORTFALL_KEY, null);
  },
};

// ----- Analytics -----
export function analytics(userEmail: string, currency: string) {
  const entries = ledger.all(userEmail).filter((e) => e.currency === currency);
  const succeeded = entries.filter(
    (e) => e.status === "succeeded" || e.status === "partially_refunded",
  );
  const deposits = succeeded
    .filter((e) => e.kind === "topup" || e.kind === "bonus")
    .reduce((s, e) => s + e.amount, 0);
  const spending = Math.abs(
    succeeded.filter((e) => e.kind === "spend").reduce((s, e) => s + e.amount, 0),
  );
  const refunds = succeeded.filter((e) => e.kind === "refund").reduce((s, e) => s + e.amount, 0);
  const pendingRefunds = entries
    .filter((e) => e.kind === "refund" && e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  const now = new Date();
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthlySpending = Math.abs(
    succeeded
      .filter((e) => e.kind === "spend" && e.createdAt >= m0)
      .reduce((s, e) => s + e.amount, 0),
  );
  const balance = ledger.balance(userEmail, currency);
  const utilization = deposits > 0 ? Math.min(100, Math.round((spending / deposits) * 100)) : 0;
  return { deposits, spending, refunds, pendingRefunds, monthlySpending, balance, utilization };
}

// ----- Intelligent gateway suggestion -----
export function suggestGateway(currency: string): "razorpay" | "paypal" {
  if (currency === "INR") return "razorpay";
  if (currency === "USD") return "paypal";
  // EU/UK/AUD/SGD/AED — PayPal has broader international coverage; Razorpay only for INR merchants.
  return "paypal";
}

// ----- CSV export -----
export function toCSV(entries: LedgerEntry[]): string {
  const cols: (keyof LedgerEntry)[] = [
    "id",
    "invoiceNumber",
    "createdAt",
    "settledAt",
    "kind",
    "status",
    "amount",
    "currency",
    "fee",
    "tax",
    "netCredit",
    "fxRate",
    "gateway",
    "gatewayTxnId",
    "method",
    "supplier",
    "bookingRef",
    "description",
  ];
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(","), ...entries.map((e) => cols.map((c) => esc(e[c])).join(","))].join("\n");
}

// Debit helper (used by booking flows once wired up).
export function chargeWallet(input: {
  userEmail: string;
  amount: number;
  currency: string;
  supplier: Supplier;
  bookingRef: string;
  description: string;
}): { ok: true; entry: LedgerEntry } | { ok: false; shortfall: number } {
  const bal = ledger.balance(input.userEmail, input.currency);
  if (bal < input.amount) return { ok: false, shortfall: input.amount - bal };
  const entry = ledger.append({
    userEmail: input.userEmail,
    kind: "spend",
    status: "succeeded",
    amount: -input.amount,
    currency: input.currency,
    gateway: "wallet",
    supplier: input.supplier,
    bookingRef: input.bookingRef,
    description: input.description,
    settledAt: new Date().toISOString(),
  });
  return { ok: true, entry };
}
