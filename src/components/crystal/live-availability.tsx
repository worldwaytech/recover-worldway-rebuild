import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revalidateCrystalVoyage } from "@/lib/crystal/crystal.functions";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface LiveFare {
  gradeId?: string;
  gradeName?: string;
  price: number;
  priceSingle?: number;
  portCharge?: number;
  tax?: number;
  currency: string;
  available?: boolean;
  availabilityCount?: number;
  guaranteeCount?: number;
  availabilityLabel?: string;
  fareType?: string;
}

interface LiveState {
  live: boolean;
  fares: LiveFare[];
  availability: string;
  priceFrom?: number;
  checkedAt: string;
  depositPercent?: number;
  depositDueDate?: string;
  finalPaymentDate?: string;
  priceTypes?: { code: string; name: string; currency?: string }[];
  error?: string;
}

/**
 * Live price and availability revalidation panel. Pulls current suite counts
 * and fares from Crystal's authorised availability operation on demand.
 */
export function LiveAvailabilityPanel({
  voyageNumber,
  currency = "USD",
}: {
  voyageNumber: string;
  currency?: string;
}) {
  const revalidate = useServerFn(revalidateCrystalVoyage);
  const [state, setState] = useState<LiveState | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCheck() {
    setBusy(true);
    try {
      const result = (await revalidate({ data: { voyageNumber, currency } })) as LiveState;
      setState(result);
      if (result.error) toast.error(result.error);
      else if (!result.fares.length) toast.info("No suites are currently open on this sailing.");
      else toast.success("Live fares and suite counts refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Live availability check failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">Live price &amp; availability</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirms current suite counts and fares directly with Crystal before you request a
            reservation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onCheck} disabled={busy}>
          {busy ? "Checking…" : state ? "Re-check" : "Check live availability"}
        </Button>
      </div>

      {state?.error ? (
        <p className="mt-4 text-sm text-muted-foreground">{state.error}</p>
      ) : state ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{state.availability}</Badge>
            {state.priceFrom ? <span>from {money(state.priceFrom, currency)} per guest</span> : null}
            <span>checked {new Date(state.checkedAt).toLocaleString()}</span>
          </div>
          {state.depositPercent || state.finalPaymentDate ? (
            <p className="text-xs text-muted-foreground">
              {state.depositPercent ? `Deposit ${state.depositPercent}%` : ""}
              {state.depositDueDate ? ` due ${state.depositDueDate}` : ""}
              {state.finalPaymentDate ? ` · final payment ${state.finalPaymentDate}` : ""}
            </p>
          ) : null}
          {state.priceTypes?.length ? (
            <p className="text-xs text-muted-foreground">
              Fare types published for this sailing:{" "}
              {state.priceTypes.map((p) => p.name || p.code).join(" · ")}
            </p>
          ) : null}
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {state.fares.map((f, i) => (
              <li
                key={`${f.gradeId ?? "grade"}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span>
                  {f.gradeName ?? f.gradeId}
                  {f.fareType ? (
                    <span className="text-xs text-muted-foreground"> · {f.fareType}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <span>{money(f.price, f.currency || currency)}</span>
                  <Badge variant={f.available ? "secondary" : "outline"}>
                    {f.availabilityLabel ?? (f.available ? "Available" : "Waitlist")}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
