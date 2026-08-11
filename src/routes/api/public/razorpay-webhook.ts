import { createFileRoute } from "@tanstack/react-router";

/**
 * Razorpay reconciliation webhook.
 * Signature is verified over the raw body before any state change.
 */
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        const { verifyWebhookSignature } = await import("@/lib/payments/razorpay.server");
        if (!verifyWebhookSignature(raw, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: {
          event?: string;
          payload?: {
            payment?: {
              entity?: {
                id?: string;
                order_id?: string;
                status?: string;
                method?: string;
                amount?: number;
                currency?: string;
                error_description?: string;
              };
            };
          };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Malformed payload", { status: 400 });
        }

        const entity = event.payload?.payment?.entity;
        const orderId = entity?.order_id;
        if (!orderId) return Response.json({ received: true, ignored: true });

        const status =
          event.event === "payment.captured" || event.event === "payment.authorized"
            ? "paid"
            : event.event === "payment.failed"
              ? "failed"
              : (entity?.status ?? "pending");

        const { markPaymentStatus } = await import("@/lib/payments/payments.server");
        await markPaymentStatus({
          orderId,
          status,
          paymentId: entity?.id ?? null,
          ...(status === "failed"
            ? { failureReason: entity?.error_description ?? "payment_failed" }
            : {}),
          providerPayload: {
            source: "webhook",
            event: event.event ?? null,
            method: entity?.method ?? null,
            amount: entity?.amount ?? null,
            currency: entity?.currency ?? null,
          },
          verified: status === "paid",
        });

        return Response.json({ received: true });
      },
    },
  },
});
