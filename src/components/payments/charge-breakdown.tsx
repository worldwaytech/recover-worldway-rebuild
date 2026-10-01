import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFeeQuote } from "@/lib/payments/fee-policy.functions";
import { formatMinor } from "@/lib/payments/plans";

type Fx = { sourceCurrency: string; sourceAmount: number; rate: number } | null | undefined;

/**
 * Shared, server-calculated charge breakdown shown before payment on every
 * checkout. The fee line comes from the real fee rules — never hard-coded.
 */
export function ChargeBreakdown({
  product, amountMinor, currency, fx, methods = ["card", "wallet"],
}: {
  product: string; amountMinor: number; currency: string; fx?: Fx;
  methods?: Array<"card" | "wallet">;
}) {
  const quote = useServerFn(getFeeQuote);
  const q = useQuery({
    queryKey: ["fee-quote", product, amountMinor, currency, fx?.rate ?? null, methods.join(",")],
    queryFn: async () =>
      Promise.all(methods.map(async (m) => ({ method: m, r: await quote({ data: { product, method: m, amountMinor, currency, fx: fx ?? null } }) }))),
  });

  if (q.isLoading) return <p className="text-xs text-muted-foreground">Checking payment charges…</p>;
  if (q.error || !q.data) return <p className="text-xs text-destructive">Payment charges could not be loaded. Please refresh before paying.</p>;

  const first = q.data[0]!.r;
  const conv = first.lines.find((l) => l.label === "Currency conversion");
  return (
    <ul className="space-y-1 border-y border-border py-2 text-xs" data-testid="charge-breakdown">
      <li className="flex justify-between gap-3"><span className="text-muted-foreground">Booking amount</span><span>{formatMinor(amountMinor, currency)}</span></li>
      {conv ? <li className="flex justify-between gap-3"><span className="text-muted-foreground">Currency conversion</span><span className="text-right">{conv.note}</span></li> : null}
      {q.data.map(({ method, r }) => {
        const fee = r.lines.find((l) => l.label === "Payment processing fee")!;
        return (
          <li key={method} className="flex justify-between gap-3">
            <span className="text-muted-foreground">Processing fee · {method === "wallet" ? "Wallet" : "card / UPI"}</span>
            <span className="text-right">{fee.amountMinor === null ? fee.note : `${formatMinor(fee.amountMinor, currency)} · ${fee.note}`}</span>
          </li>
        );
      })}
      <li className="flex justify-between gap-3 font-medium"><span>Total payable</span><span>{formatMinor(first.totalMinor, currency)}</span></li>
    </ul>
  );
}
