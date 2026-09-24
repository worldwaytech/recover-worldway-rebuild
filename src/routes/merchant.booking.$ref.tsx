import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  cancelMerchantExperience,
  listMyMerchantBookings,
  refreshMerchantBooking,
} from "@/lib/viator-merchant/merchant.functions";

export const Route = createFileRoute("/merchant/booking/$ref")({
  head: () => ({
    meta: [
      { title: "Your Experience Booking — Worldway Travels" },
      { name: "description", content: "Booking status, ticket and cancellation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MerchantBookingPage,
});

const STATE_LABEL: Record<string, string> = {
  held: "Reserved — awaiting confirmation",
  pending: "Confirmation in progress",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rejected: "Declined by the operator",
  failed: "Failed",
};

function MerchantBookingPage() {
  const { ref } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-merchant-bookings"],
    queryFn: () => listMyMerchantBookings(),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const booking = data?.bookings.find((b) => b.partner_booking_ref === ref);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await refreshMerchantBooking({ data: { partnerBookingRef: ref } });
      if (!res.ok) setMessage(res.error ?? "Status could not be refreshed.");
      await queryClient.invalidateQueries({ queryKey: ["my-merchant-bookings"] });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await cancelMerchantExperience({
        data: { partnerBookingRef: ref, reasonCode: "Customer_Service.Unexpected_medical_circumstances" },
      });
      setMessage(
        res.ok
          ? `Cancelled.${res.refundAmount !== null ? ` Refund: ${res.currency ?? ""} ${res.refundAmount?.toFixed(2)} (${res.refundPercentage ?? 0}%).` : ""}`
          : (res.error ?? "Cancellation failed."),
      );
      await queryClient.invalidateQueries({ queryKey: ["my-merchant-bookings"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-muted-foreground">
        <Link to="/merchant" className="underline">Merchant Experiences</Link> / Booking
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-foreground">Your booking</h1>

      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {(isError || (data && !data.ok)) && (
        <p className="mt-6 text-muted-foreground">
          Please sign in to view this booking.
        </p>
      )}
      {data?.ok && !booking && (
        <p className="mt-6 text-muted-foreground">This booking was not found on your account.</p>
      )}

      {booking && (
        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-foreground">
              {booking.product_title ?? booking.product_code}
            </h2>
            <span className="rounded-full bg-muted px-3 py-1 text-sm text-foreground">
              {STATE_LABEL[booking.status] ?? booking.status}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Reference</dt><dd className="text-foreground">{booking.partner_booking_ref}</dd></div>
            <div><dt className="text-muted-foreground">Date</dt><dd className="text-foreground">{booking.travel_date}{booking.start_time ? ` · ${booking.start_time}` : ""}</dd></div>
            <div><dt className="text-muted-foreground">Travellers</dt><dd className="text-foreground">{booking.traveller_count}</dd></div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-foreground">
                {booking.retail_price !== null
                  ? `${booking.currency} ${Number(booking.retail_price).toFixed(2)}`
                  : "—"}
              </dd>
            </div>
          </dl>

          {booking.status === "confirmed" && booking.voucher_url && (
            <a
              href={booking.voucher_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block rounded-md bg-primary px-5 py-2 text-primary-foreground"
            >
              View ticket / voucher
            </a>
          )}
          {booking.failure_reason && (
            <p className="mt-4 text-sm text-muted-foreground">{booking.failure_reason}</p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={refresh}
              className="rounded-md border border-border px-4 py-2 text-foreground disabled:opacity-50"
            >
              Refresh status
            </button>
            {(booking.status === "confirmed" || booking.status === "pending") && booking.booking_ref && (
              <button
                type="button"
                disabled={busy}
                onClick={cancel}
                className="rounded-md border border-destructive px-4 py-2 text-destructive disabled:opacity-50"
              >
                Cancel booking
              </button>
            )}
          </div>
          {message && <p className="mt-3 text-sm text-foreground">{message}</p>}
        </section>
      )}
    </main>
  );
}
