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

        const { markPaymentStatus, getPaymentByOrderId, applyVerifiedMembership } = await import(
          "@/lib/payments/payments.server"
        );
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

        if (status === "paid") {
          const record = await getPaymentByOrderId(orderId);
          if (record?.purpose === "membership" && record.user_id && record.plan_id) {
            await applyVerifiedMembership(record.user_id, record.plan_id);
          }
          const avRef = (record?.reference as Record<string, unknown> | undefined)?.["aviation_reference"];
          if (record?.purpose === "private_aviation" && typeof avRef === "string" && entity?.id) {
            const { finalizeAviationPayment } = await import("@/lib/aviation/payment.server");
            await finalizeAviationPayment({ reference: avRef, orderId, paymentId: entity.id, userId: record.user_id ?? null }).catch((e) =>
              console.error("[razorpay-webhook] aviation finalize failed", (e as Error).message),
            );
          }
        }

        return Response.json({ received: true });

      },
    },
  },
});
