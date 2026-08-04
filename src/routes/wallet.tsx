import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portal, type PortalUser } from "@/lib/portal-store";
import {
  walletBalance,
  walletTransactions,
  createTopup,
  verifyTopup,
  WALLET_LIMITS,
  WALLET_CURRENCIES,
} from "@/lib/wwl.functions";
import {
  Wallet,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Smartphone,
  Landmark,
  Globe2,
  WalletCards,
  Download,
  Bell,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  AlertTriangle,
} from "lucide-react";
import {
  ledger,
  notif,
  promo,
  shortfall as shortfallStore,
  analytics,
  suggestGateway,
  toCSV,
  type LedgerStatus,
} from "@/lib/wallet-ledger";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Enterprise multi-currency wallet with full ledger, refunds, analytics, and low-balance assistant.",
      },
    ],
  }),
  component: WalletPage,
});

const nf = (v: number, c: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(v);

// Standard gateway pricing (published rates; GST/VAT extra where applicable).
type FeeRule = {
  key: string;
  label: string;
  icon: React.ReactNode;
  percent: number;
  flat?: number;
  note?: string;
};
const RAZORPAY_FEES: FeeRule[] = [
  {
    key: "upi",
    label: "UPI",
    icon: <Smartphone className="h-4 w-4" />,
    percent: 0,
    note: "Zero fees on Razorpay Standard",
  },
  {
    key: "rupay_debit",
    label: "RuPay Debit card",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 0,
    note: "RBI mandate — no MDR",
  },
  {
    key: "debit_dom",
    label: "Debit card (Visa / Mastercard, domestic)",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 2,
  },
  {
    key: "credit_dom",
    label: "Credit card (domestic)",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 2,
  },
  {
    key: "wallet",
    label: "Wallets (Paytm, PhonePe, Mobikwik, Freecharge)",
    icon: <WalletCards className="h-4 w-4" />,
    percent: 2,
  },
  {
    key: "netbanking",
    label: "Net Banking (all major banks)",
    icon: <Landmark className="h-4 w-4" />,
    percent: 2,
  },
  {
    key: "emi",
    label: "EMI (Credit card / Cardless)",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 3,
  },
  { key: "intl", label: "International cards", icon: <Globe2 className="h-4 w-4" />, percent: 3 },
  {
    key: "amex",
    label: "American Express (domestic)",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 3,
  },
];
const PAYPAL_FEES: FeeRule[] = [
  {
    key: "paypal_balance",
    label: "PayPal balance (domestic)",
    icon: <WalletCards className="h-4 w-4" />,
    percent: 2.9,
    flat: 0.3,
  },
  {
    key: "paypal_card_dom",
    label: "Debit / Credit card (domestic)",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 2.9,
    flat: 0.3,
  },
  {
    key: "paypal_intl_card",
    label: "International card",
    icon: <Globe2 className="h-4 w-4" />,
    percent: 4.4,
    flat: 0.3,
    note: "+ 3–4% currency conversion",
  },
  {
    key: "paypal_xborder",
    label: "Cross-border PayPal transfer",
    icon: <Globe2 className="h-4 w-4" />,
    percent: 4.4,
    flat: 0.3,
    note: "Cross-border fee applies",
  },
  {
    key: "paypal_amex",
    label: "American Express",
    icon: <CreditCard className="h-4 w-4" />,
    percent: 3.5,
    flat: 0.3,
  },
];
const GST_PERCENT = 18;

// Per-transaction gateway limits.
const GATEWAY_MIN: Record<"razorpay" | "paypal", Record<string, number>> = {
  razorpay: { INR: 1, USD: 1, EUR: 1, GBP: 1, AED: 1, SGD: 1, AUD: 1 },
  paypal: { USD: 1, EUR: 1, GBP: 1, AED: 4, SGD: 2, AUD: 2, INR: 100 },
};
const GATEWAY_MAX: Record<"razorpay" | "paypal", Record<string, number>> = {
  razorpay: {
    INR: 500_000,
    USD: 6_000,
    EUR: 5_500,
    GBP: 4_700,
    AED: 22_000,
    SGD: 8_000,
    AUD: 9_000,
  },
  paypal: {
    USD: 25_000,
    EUR: 23_000,
    GBP: 20_000,
    AED: 91_000,
    SGD: 33_000,
    AUD: 37_000,
    INR: 2_075_000,
  },
};
const QUICK_AMOUNTS: Record<string, number[]> = {
  INR: [1000, 5000, 25000, 100000, 500000],
  USD: [50, 250, 1000, 5000, 25000],
  EUR: [50, 250, 1000, 5000, 23000],
  GBP: [50, 250, 1000, 5000, 20000],
  AED: [200, 1000, 5000, 25000, 90000],
  SGD: [50, 250, 1000, 5000, 30000],
  AUD: [75, 300, 1500, 7500, 35000],
};

function calcFee(rule: FeeRule, amount: number, currency: string) {
  const base = (rule.percent / 100) * amount + (rule.flat ?? 0);
  const tax = currency === "INR" ? base * (GST_PERCENT / 100) : 0;
  return { base, tax, total: base + tax };
}

type ApiTxn = {
  id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  status?: string;
  createdAt?: string;
  description?: string;
};

function StatusBadge({ status }: { status: LedgerStatus }) {
  const map: Record<LedgerStatus, string> = {
    succeeded: "text-primary border-primary/40 bg-primary/10",
    pending: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10",
    failed: "text-destructive border-destructive/40 bg-destructive/10",
    refunded: "text-muted-foreground border-border/60 bg-background/40",
    partially_refunded: "text-muted-foreground border-border/60 bg-background/40",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${map[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function WalletPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [balance, setBalance] = useState<{ amount: number; currency: string } | null>(null);
  const [txns, setTxns] = useState<ApiTxn[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"razorpay" | "paypal">("razorpay");
  const [gwOverride, setGwOverride] = useState(false);
  const [feeKey, setFeeKey] = useState<string>("upi");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<ReturnType<typeof shortfallStore.get>>(null);
  const [filters, setFilters] = useState({
    kind: "all",
    status: "all",
    supplier: "all",
    gateway: "all",
    from: "",
    to: "",
    q: "",
  });

  useEffect(() => {
    const s = portal.session();
    if (!s) {
      nav({ to: "/auth" });
      return;
    }
    setMe(s);
    const sf = shortfallStore.get();
    if (sf) {
      setPending(sf);
      setCurrency(sf.currency);
      setAmount(String(sf.amount));
      setMethod(suggestGateway(sf.currency));
    }
  }, [nav]);

  useEffect(() => {
    if (!gwOverride) setMethod(suggestGateway(currency));
  }, [currency, gwOverride]);

  const limit = WALLET_LIMITS[currency] ?? 0;
  const gwMin = GATEWAY_MIN[method][currency] ?? 1;
  const gwMax = Math.min(GATEWAY_MAX[method][currency] ?? limit, limit);
  const gwMinLabel = useMemo(() => nf(gwMin, currency), [gwMin, currency]);
  const gwMaxLabel = useMemo(() => nf(gwMax, currency), [gwMax, currency]);
  const quickAmounts = (QUICK_AMOUNTS[currency] ?? []).filter((v) => v >= gwMin && v <= gwMax);
  const activeFees = method === "razorpay" ? RAZORPAY_FEES : PAYPAL_FEES;
  const activeRule = activeFees.find((f) => f.key === feeKey) ?? activeFees[0];
  const amountNum = Number(amount) || 0;
  const feeCalc = calcFee(activeRule, amountNum, currency);
  const payable = amountNum + feeCalc.total;

  useEffect(() => {
    setFeeKey(method === "razorpay" ? "upi" : "paypal_balance");
  }, [method]);

  const localLedger = useMemo(() => (me ? ledger.all(me.email) : []), [me, tick]);
  const notifications = useMemo(() => (me ? notif.all(me.email) : []), [me, tick]);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const promos = useMemo(() => (me ? promo.active(me.email, currency) : []), [me, currency, tick]);
  const stats = useMemo(() => (me ? analytics(me.email, currency) : null), [me, currency, tick]);

  const filtered = useMemo(
    () =>
      localLedger.filter((e) => {
        if (e.currency !== currency) return false;
        if (filters.kind !== "all" && e.kind !== filters.kind) return false;
        if (filters.status !== "all" && e.status !== filters.status) return false;
        if (filters.supplier !== "all" && e.supplier !== filters.supplier) return false;
        if (filters.gateway !== "all" && e.gateway !== filters.gateway) return false;
        if (filters.from && e.createdAt < new Date(filters.from).toISOString()) return false;
        if (filters.to && e.createdAt > new Date(filters.to + "T23:59:59").toISOString())
          return false;
        if (filters.q) {
          const q = filters.q.toLowerCase();
          if (
            ![e.description, e.bookingRef, e.id, e.gatewayTxnId].some((v) =>
              v?.toLowerCase().includes(q),
            )
          )
            return false;
        }
        return true;
      }),
    [localLedger, filters, currency],
  );

  async function refresh(user: PortalUser) {
    try {
      const b = await walletBalance({ data: { clientEmail: user.email } });
      const bd = (b?.data ?? {}) as { amount?: number; currency?: string };
      if (b?.ok)
        setBalance({ amount: Number(bd.amount ?? 0), currency: String(bd.currency ?? currency) });
      const t = await walletTransactions({ data: { clientEmail: user.email, limit: 20 } });
      const td = (t?.data ?? {}) as { items?: ApiTxn[] };
      setTxns(Array.isArray(td.items) ? td.items : []);
    } catch {
      /* partner API not reachable */
    }
  }

  useEffect(() => {
    if (me) refresh(me);
  }, [me]);

  function downloadCSV() {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-statement-${currency}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function topup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!me) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Enter a valid amount.");
      return;
    }
    if (n < gwMin) {
      setErr(`Minimum ${method === "razorpay" ? "Razorpay" : "PayPal"} top-up is ${gwMinLabel}.`);
      return;
    }
    if (n > gwMax) {
      setErr(
        `Maximum ${method === "razorpay" ? "Razorpay" : "PayPal"} top-up per transaction is ${gwMaxLabel}. Split into multiple top-ups for larger amounts.`,
      );
      return;
    }
    // Duplicate payment guard
    const dup = ledger
      .all(me.email)
      .find(
        (x) =>
          x.kind === "topup" &&
          x.amount === n &&
          x.currency === currency &&
          x.gateway === method &&
          Date.now() - new Date(x.createdAt).getTime() < 30_000,
      );
    if (dup) {
      setErr("An identical top-up was just started. Wait a moment before retrying.");
      return;
    }
    setBusy(true);
    try {
      const r = await createTopup({
        data: { amount: n, currency, method, clientEmail: me.email, clientName: me.name },
      });
      const entry = ledger.append({
        userEmail: me.email,
        kind: "topup",
        status: r?.ok ? "pending" : "failed",
        amount: n,
        currency,
        gateway: method,
        method: feeKey,
        fee: feeCalc.base,
        tax: feeCalc.tax,
        netCredit: n,
        description: `Top-up via ${method === "razorpay" ? "Razorpay" : "PayPal"} (${activeRule.label})`,
      });
      setTick((t) => t + 1);
      if (!r?.ok) {
        notif.push({
          userEmail: me.email,
          kind: "topup_failed",
          title: "Top-up failed",
          body: r?.error || "Gateway declined the request.",
        });
        setErr(r?.error || "Could not initiate top-up.");
        return;
      }
      const d = (r.data ?? {}) as {
        checkoutUrl?: string;
        approveUrl?: string;
        reference?: string;
        orderId?: string;
      };
      const url = d.checkoutUrl || d.approveUrl;
      const ref = d.reference || d.orderId;
      if (ref) ledger.update(entry.id, { gatewayTxnId: ref });
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setMsg(
          `Top-up started via ${method === "razorpay" ? "Razorpay" : "PayPal"}. Complete payment in the new tab.`,
        );
      } else setMsg("Top-up requested. It will appear once confirmed by the payment gateway.");
      // Real settlement: poll verifyTopup until the gateway confirms.
      // Never mark the ledger entry succeeded without an explicit gateway ack.
      if (ref) {
        let attempts = 0;
        const maxAttempts = 40; // ~10 min at 15s cadence
        const poll = async () => {
          attempts += 1;
          try {
            const v = await verifyTopup({
              data: { method, reference: ref, clientEmail: me.email },
            });
            const vd = (v?.data ?? {}) as { status?: string };
            const status = String(vd.status ?? "").toLowerCase();
            if (
              v?.ok &&
              (status === "succeeded" ||
                status === "paid" ||
                status === "captured" ||
                status === "completed")
            ) {
              ledger.update(entry.id, { status: "succeeded", settledAt: new Date().toISOString() });
              notif.push({
                userEmail: me.email,
                kind: "topup_success",
                title: "Top-up successful",
                body: `${nf(n, currency)} credited to your wallet.`,
              });
              setTick((t) => t + 1);
              refresh(me);
              if (pending && pending.currency === currency) {
                shortfallStore.clear();
                setMsg(`Top-up complete. Redirecting to ${pending.label}…`);
                setTimeout(() => nav({ to: pending.returnTo }), 1200);
              }
              return;
            }
            if (
              v?.ok &&
              (status === "failed" ||
                status === "cancelled" ||
                status === "canceled" ||
                status === "expired")
            ) {
              ledger.update(entry.id, { status: "failed" });
              notif.push({
                userEmail: me.email,
                kind: "topup_failed",
                title: "Top-up not completed",
                body: "Payment was not completed in the gateway.",
              });
              setTick((t) => t + 1);
              return;
            }
          } catch {
            /* transient; keep polling */
          }
          if (attempts < maxAttempts) setTimeout(poll, 15_000);
        };
        setTimeout(poll, 8_000);
      }
      // Refresh the partner balance shortly after so the header reflects any confirmed settlement.
      setTimeout(() => refresh(me), 10_000);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  const displayBalance = balance?.amount ?? stats?.balance ?? 0;
  const displayCurrency = balance?.currency ?? currency;

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-portal)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16 space-y-10">
        {pending && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4 text-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium text-primary">Complete your {pending.label}</div>
                <div className="text-xs text-muted-foreground">
                  Top up only {nf(pending.amount, pending.currency)} to finish checkout. You'll
                  return automatically once payment settles.
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                shortfallStore.clear();
                setPending(null);
              }}
            >
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Enterprise multi-currency wallet
            </div>
            <h1 className="mt-2 font-serif text-5xl text-primary">Wallet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Full ledger, refunds, analytics, and smart top-ups.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> PCI-secure gateways
            </div>
            <button
              onClick={() => {
                notif.markAllRead(me.email);
                setTick((t) => t + 1);
              }}
              className="relative flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40"
            >
              <Bell className="h-3.5 w-3.5 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Balance", value: displayBalance, icon: <Wallet className="h-4 w-4" /> },
              {
                label: "Lifetime deposits",
                value: stats.deposits,
                icon: <ArrowDownCircle className="h-4 w-4" />,
              },
              {
                label: "Lifetime spend",
                value: stats.spending,
                icon: <ArrowUpCircle className="h-4 w-4" />,
              },
              { label: "Refunds", value: stats.refunds, icon: <TrendingUp className="h-4 w-4" /> },
              {
                label: "Pending refunds",
                value: stats.pendingRefunds,
                icon: <TrendingUp className="h-4 w-4" />,
              },
              {
                label: "This month",
                value: stats.monthlySpending,
                icon: <TrendingUp className="h-4 w-4" />,
              },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-2xl border border-border/60 bg-background/60 p-4"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {k.icon}
                  {k.label}
                </div>
                <div className="mt-2 font-serif text-xl text-primary">{nf(k.value, currency)}</div>
              </div>
            ))}
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4 sm:col-span-3 lg:col-span-6">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Wallet utilization</span>
                <span>{stats.utilization}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full"
                  style={{ width: `${stats.utilization}%`, background: "var(--gradient-gold)" }}
                />
              </div>
            </div>
          </div>
        )}

        {promos.length > 0 && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary">
              <Gift className="h-3.5 w-3.5" /> Promotional credits
            </div>
            <ul className="mt-2 grid gap-1 text-sm">
              {promos.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.label}</span>
                  <span className="text-primary">
                    {nf(p.amount, p.currency)} · expires{" "}
                    {new Date(p.expiresAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card/70 p-8"
            style={{ boxShadow: "var(--shadow-glow)" }}
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl"
              style={{ background: "var(--gradient-gold)" }}
            />
            <div className="relative flex items-center justify-between">
              <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                Available balance
              </span>
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="relative mt-6 font-serif text-5xl text-primary">
              {nf(displayBalance, displayCurrency)}
            </div>
            <p className="relative mt-3 text-xs text-muted-foreground">{me.email}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top up</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={topup} className="space-y-3">
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={gwMin}
                      max={gwMax}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <select
                      value={currency}
                      onChange={(e) => {
                        setCurrency(e.target.value);
                        setGwOverride(false);
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {WALLET_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {method === "razorpay" ? "Razorpay" : "PayPal"} per-transaction: min {gwMinLabel}{" "}
                  · max {gwMaxLabel}
                  {method === "razorpay" && currency === "INR" ? " (₹5,00,000)" : ""}
                  {method === "paypal" && currency === "USD" ? " ($25,000)" : ""}. For larger
                  amounts, split into multiple top-ups.
                </p>
                {quickAmounts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmount(String(v))}
                        className={`rounded-full border px-3 py-1 text-xs transition ${Number(amount) === v ? "border-primary text-primary" : "border-border/60 text-muted-foreground hover:border-primary/50"}`}
                      >
                        {nf(v, currency)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAmount(String(gwMax))}
                      className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary hover:border-primary"
                    >
                      Max
                    </button>
                  </div>
                )}

                <div>
                  <Label>Payment method</Label>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Suggested for {currency}:{" "}
                    <span className="text-primary">
                      {suggestGateway(currency) === "razorpay" ? "Razorpay" : "PayPal"}
                    </span>{" "}
                    — lowest cost + broadest coverage. Override anytime.
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(["razorpay", "paypal"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMethod(m);
                          setGwOverride(true);
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm capitalize ${method === m ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Payment option</Label>
                  {method === "razorpay" ? (
                    <p className="mt-1 text-[11px] text-primary">💡 Pay via UPI for zero fees.</p>
                  ) : null}
                  <div className="mt-1 grid gap-2">
                    {activeFees.map((f) => {
                      const c = calcFee(f, amountNum, currency);
                      const selected = feeKey === f.key;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFeeKey(f.key)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${selected ? "border-primary text-primary" : "border-border/60 text-muted-foreground hover:border-primary/50"}`}
                        >
                          <span className="flex items-center gap-2">
                            {f.icon}
                            <span>
                              <span className="block">{f.label}</span>
                              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                                {f.percent}%
                                {f.flat
                                  ? ` + ${nf(f.flat, currency === "INR" ? "USD" : currency)}`
                                  : ""}
                                {f.note ? ` · ${f.note}` : ""}
                              </span>
                            </span>
                          </span>
                          <span className="text-xs">
                            {amountNum > 0 ? nf(c.total, currency) : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Top-up amount</span>
                    <span>{nf(amountNum, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Gateway fee ({activeRule.percent}%
                      {activeRule.flat
                        ? ` + ${nf(activeRule.flat, currency === "INR" ? "USD" : currency)}`
                        : ""}
                      )
                    </span>
                    <span>{nf(feeCalc.base, currency)}</span>
                  </div>
                  {currency === "INR" ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST ({GST_PERCENT}% on fee)</span>
                      <span>{nf(feeCalc.tax, currency)}</span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between border-t border-border/60 pt-1 text-primary">
                    <span>You pay</span>
                    <span>{nf(payable, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credited to wallet</span>
                    <span>{nf(amountNum, currency)}</span>
                  </div>
                </div>

                {err && <p className="text-sm text-destructive">{err}</p>}
                {msg && <p className="text-sm text-primary">{msg}</p>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy
                    ? "Starting…"
                    : `Top up with ${method === "razorpay" ? "Razorpay" : "PayPal"}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Transaction ledger</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete audit trail with fees, tax, gateway IDs, supplier & booking references.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCSV}
              disabled={filtered.length === 0}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["kind", ["all", "topup", "spend", "refund", "bonus", "adjustment"]],
                  [
                    "status",
                    ["all", "pending", "succeeded", "failed", "refunded", "partially_refunded"],
                  ],
                  [
                    "supplier",
                    [
                      "all",
                      "hotels",
                      "flights",
                      "activities",
                      "transfers",
                      "cruises",
                      "rail",
                      "private_jets",
                      "packages",
                      "buses",
                    ],
                  ],
                  ["gateway", ["all", "razorpay", "paypal", "wallet", "promo", "manual"]],
                ] as const
              ).map(([k, opts]) => (
                <select
                  key={k}
                  value={filters[k]}
                  onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs capitalize"
                >
                  {opts.map((o) => (
                    <option key={o} value={o}>
                      {k}: {o.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              ))}
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                className="h-9 text-xs"
              />
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                className="h-9 text-xs"
              />
              <Input
                placeholder="Search description, booking, txn id…"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                className="h-9 text-xs sm:col-span-2"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions match your filters. Start a top-up above to see your first ledger
                entry.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Description</th>
                      <th className="py-2 text-left">Kind</th>
                      <th className="py-2 text-left">Gateway</th>
                      <th className="py-2 text-right">Fee</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2 text-left">Status</th>
                      <th className="py-2 text-left">Booking</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filtered.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="py-2">
                          <div>{e.description}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {e.id}
                            {e.gatewayTxnId ? ` · ${e.gatewayTxnId}` : ""}
                            {e.invoiceNumber ? ` · ${e.invoiceNumber}` : ""}
                          </div>
                        </td>
                        <td className="py-2 capitalize">{e.kind}</td>
                        <td className="py-2 capitalize">
                          {e.gateway}
                          {e.method ? ` · ${e.method}` : ""}
                        </td>
                        <td className="py-2 text-right">
                          {e.fee ? nf(e.fee + (e.tax ?? 0), e.currency) : "—"}
                        </td>
                        <td
                          className={`py-2 text-right ${e.amount < 0 ? "text-destructive" : "text-primary"}`}
                        >
                          {nf(e.amount, e.currency)}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={e.status} />
                        </td>
                        <td className="py-2">{e.bookingRef || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {txns.length > 0 && (
              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Partner API transactions ({txns.length})
                </summary>
                <ul className="mt-2 divide-y divide-border/60">
                  {txns.map((t, i) => (
                    <li key={t.id ?? i} className="flex items-center justify-between py-2">
                      <div>
                        <div>
                          {t.description || (t.method ? `${t.method} top-up` : "Transaction")}
                        </div>
                        <div className="text-[10px]">
                          {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div>
                          {t.amount != null && t.currency ? nf(Number(t.amount), t.currency) : ""}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest">
                          {t.status || ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        {notifications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60 text-sm">
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-4 py-2">
                    <div>
                      <div className={n.read ? "text-muted-foreground" : "text-primary"}>
                        {n.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{n.body}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Payment gateway charges</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Standard published rates from Razorpay & PayPal. GST (18%) applies on the fee for INR
              transactions. Displayed for transparency — only the top-up amount is credited to your
              wallet.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              { title: "Razorpay", rows: RAZORPAY_FEES },
              { title: "PayPal", rows: PAYPAL_FEES },
            ].map((g) => (
              <div key={g.title}>
                <div className="mb-2 text-[0.65rem] uppercase tracking-[0.3em] text-primary">
                  {g.title}
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-background/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Method</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">
                          Fee on {nf(amountNum || 1000, currency)}
                        </th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {g.rows.map((f) => {
                        const c = calcFee(f, amountNum || 1000, currency);
                        return (
                          <tr key={f.key}>
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-2">
                                {f.icon}
                                {f.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {f.percent}%
                              {f.flat
                                ? ` + ${nf(f.flat, currency === "INR" ? "USD" : currency)}`
                                : ""}
                            </td>
                            <td className="px-3 py-2 text-right">{nf(c.total, currency)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {f.note || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Sources: razorpay.com/pricing · paypal.com/in/business/fees. Rates may vary based on
              merchant category and negotiated pricing.
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
