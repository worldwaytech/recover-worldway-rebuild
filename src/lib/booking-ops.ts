// Post-booking operations data layer — Lovable Cloud backed, RLS scoped.
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Booking = Tables<"bookings">;
export type BookingEvent = Tables<"booking_events">;
export type BookingPayment = Tables<"booking_payments">;
export type BookingInstallment = Tables<"booking_installments">;
export type BookingDocument = Tables<"booking_documents">;
export type BookingMessage = Tables<"booking_messages">;
export type BookingRequest = Tables<"booking_requests">;
export type AppNotification = Tables<"notifications">;

function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data == null) throw new Error("Not found");
  return res.data as NonNullable<T>;
}

function list<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export function money(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function docReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/** Deterministic instalment plan: deposit now, balance 45 days before travel. */
export function planInstallments(
  booking: Booking,
): Array<{ label: string; due_date: string; amount: number }> {
  const total = Number(booking.amount ?? 0);
  if (!total) return [];
  const deposit = Number(booking.deposit_amount ?? Math.round(total * 0.25));
  const balance = Math.max(0, total - deposit);
  const travel = booking.travel_date ? new Date(booking.travel_date) : null;
  const balanceDue =
    travel && !Number.isNaN(travel.getTime())
      ? new Date(travel.getTime() - 45 * 86400000)
      : new Date(Date.now() + 30 * 86400000);
  const today = new Date();
  return [
    { label: "Deposit", due_date: today.toISOString().slice(0, 10), amount: deposit },
    ...(balance > 0
      ? [
          {
            label: "Final balance",
            due_date: (balanceDue > today ? balanceDue : today).toISOString().slice(0, 10),
            amount: balance,
          },
        ]
      : []),
  ];
}

export const bookingOps = {
  async get(id: string): Promise<Booking> {
    return must(await supabase.from("bookings").select("*").eq("id", id).maybeSingle());
  },
  async all(): Promise<Booking[]> {
    return list(
      await supabase.from("bookings").select("*").order("created_at", { ascending: false }),
    );
  },
  async events(bookingId: string): Promise<BookingEvent[]> {
    return list(
      await supabase
        .from("booking_events")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
    );
  },
  async logEvent(input: TablesInsert<"booking_events">): Promise<BookingEvent> {
    return must(await supabase.from("booking_events").insert(input).select().single());
  },
  async payments(bookingId: string): Promise<BookingPayment[]> {
    return list(
      await supabase
        .from("booking_payments")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
    );
  },
  async installments(bookingId: string): Promise<BookingInstallment[]> {
    return list(
      await supabase
        .from("booking_installments")
        .select("*")
        .eq("booking_id", bookingId)
        .order("due_date", { ascending: true }),
    );
  },
  async documents(bookingId: string): Promise<BookingDocument[]> {
    return list(
      await supabase
        .from("booking_documents")
        .select("*")
        .eq("booking_id", bookingId)
        .order("issued_at", { ascending: false }),
    );
  },
  async messages(bookingId: string): Promise<BookingMessage[]> {
    return list(
      await supabase
        .from("booking_messages")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true }),
    );
  },
  async requests(bookingId: string): Promise<BookingRequest[]> {
    return list(
      await supabase
        .from("booking_requests")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
    );
  },

  async sendMessage(bookingId: string, body: string, internal = false): Promise<BookingMessage> {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) throw new Error("Please sign in to send a message.");
    return must(
      await supabase
        .from("booking_messages")
        .insert({
          booking_id: bookingId,
          author_id: user.id,
          author_label: internal ? "Worldway operations" : (user.email ?? "Customer"),
          body,
          internal,
        })
        .select()
        .single(),
    );
  },

  async raiseRequest(
    booking: Booking,
    request_type: "amendment" | "cancellation" | "refund",
    details: string,
  ): Promise<BookingRequest> {
    const row = must(
      await supabase
        .from("booking_requests")
        .insert({ booking_id: booking.id, user_id: booking.user_id, request_type, details })
        .select()
        .single(),
    );
    await bookingOps.logEvent({
      booking_id: booking.id,
      event_type: `request.${request_type}`,
      summary: `${request_type} request submitted`,
      actor_label: "Customer",
      detail: { details },
    });
    await bookingOps.notify(booking.user_id, booking.id, {
      event: `request.${request_type}`,
      title: "Request received",
      body: `Your ${request_type} request for ${booking.title} is with our operations team.`,
    });
    return row;
  },

  async notify(
    userId: string,
    bookingId: string | null,
    input: { event: string; title: string; body: string; channel?: string },
  ): Promise<void> {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      booking_id: bookingId,
      event: input.event,
      title: input.title,
      body: input.body,
      channel: input.channel ?? "in_app",
      status: "sent",
    });
    if (error) throw new Error(error.message);
  },

  async notifications(): Promise<AppNotification[]> {
    return list(
      await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    );
  },

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString(), status: "read" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Ensure a booking has its instalment schedule + confirmation document. */
  async ensureLifecycle(booking: Booking): Promise<void> {
    const [installments, documents, events] = await Promise.all([
      bookingOps.installments(booking.id),
      bookingOps.documents(booking.id),
      bookingOps.events(booking.id),
    ]);

    if (installments.length === 0) {
      const plan = planInstallments(booking);
      if (plan.length) {
        const { error } = await supabase.from("booking_installments").insert(
          plan.map((p) => ({
            booking_id: booking.id,
            user_id: booking.user_id,
            label: p.label,
            due_date: p.due_date,
            amount: p.amount,
            currency: booking.currency ?? "USD",
          })),
        );
        if (error) throw new Error(error.message);
      }
    }

    if (!documents.some((d) => d.doc_type === "confirmation")) {
      await bookingOps.issueDocument(booking, "confirmation");
    }

    if (events.length === 0) {
      await bookingOps.logEvent({
        booking_id: booking.id,
        event_type: "booking.created",
        summary: `Booking ${booking.reference} created`,
        actor_label: "system",
        detail: { status: booking.status },
      });
    }
  },

  async issueDocument(
    booking: Booking,
    doc_type: "confirmation" | "invoice" | "receipt" | "voucher" | "itinerary" | "credit_note",
  ): Promise<BookingDocument> {
    const titles: Record<string, string> = {
      confirmation: "Booking confirmation",
      invoice: "Tax invoice",
      receipt: "Payment receipt",
      voucher: "Travel voucher",
      itinerary: "Itinerary pack",
      credit_note: "Credit note",
    };
    const row = must(
      await supabase
        .from("booking_documents")
        .insert({
          booking_id: booking.id,
          user_id: booking.user_id,
          doc_type,
          title: titles[doc_type] ?? doc_type,
          reference: docReference(doc_type.slice(0, 3).toUpperCase()),
          content: {
            booking_reference: booking.reference,
            product: booking.title,
            product_type: booking.product_type,
            supplier: booking.supplier,
            travel_date: booking.travel_date,
            amount: booking.amount,
            currency: booking.currency,
            amount_paid: booking.amount_paid,
            balance_due: booking.balance_due,
          },
        })
        .select()
        .single(),
    );
    await bookingOps.logEvent({
      booking_id: booking.id,
      event_type: "document.issued",
      summary: `${row.title} issued (${row.reference})`,
      actor_label: "system",
      detail: { doc_type },
    });
    return row;
  },

  /** Staff-only: move a booking through its operational lifecycle. */
  async setStatus(booking: Booking, status: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc("staff_update_booking", {
      _booking_id: booking.id,
      _status: status,
    });
    if (error) throw new Error(error.message);
    await bookingOps.logEvent({
      booking_id: booking.id,
      event_type: "status.changed",
      summary: `Status changed to ${status}`,
      actor_label: "Worldway operations",
      detail: { from: booking.status, to: status, note: note ?? null },
    });
    await bookingOps.notify(booking.user_id, booking.id, {
      event: "status.changed",
      title: `Booking ${booking.reference} is now ${status}`,
      body: note ?? `${booking.title} moved to ${status}.`,
    });
  },

  async recordPayment(
    booking: Booking,
    input: {
      amount: number;
      kind?: "payment" | "deposit" | "refund";
      method?: string;
      gateway_reference?: string;
      note?: string;
      installmentId?: string;
    },
  ): Promise<void> {
    const kind = input.kind ?? "payment";
    const signed = kind === "refund" ? -Math.abs(input.amount) : Math.abs(input.amount);
    const payment = must(
      await supabase
        .from("booking_payments")
        .insert({
          booking_id: booking.id,
          user_id: booking.user_id,
          kind,
          amount: Math.abs(input.amount),
          currency: booking.currency ?? "USD",
          method: input.method ?? "wallet",
          gateway_reference: input.gateway_reference ?? null,
          note: input.note ?? null,
        })
        .select()
        .single(),
    );

    const paid = Math.max(0, Number(booking.amount_paid ?? 0) + signed);
    const total = Number(booking.amount ?? 0);
    const { error: upErr } = await supabase.rpc("staff_update_booking", {
      _booking_id: booking.id,
      _amount_paid: paid,
      _balance_due: Math.max(0, total - paid),
    });
    if (upErr) throw new Error(upErr.message);

    if (input.installmentId) {
      await supabase
        .from("booking_installments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", input.installmentId);
    }

    await bookingOps.logEvent({
      booking_id: booking.id,
      event_type: `payment.${kind}`,
      summary: `${kind === "refund" ? "Refund" : "Payment"} of ${money(Math.abs(input.amount), booking.currency ?? "USD")} recorded`,
      actor_label: "Worldway payments",
      detail: { payment_id: payment.id, method: input.method ?? "wallet" },
    });

    await bookingOps.issueDocument(
      { ...booking, amount_paid: paid, balance_due: Math.max(0, total - paid) },
      kind === "refund" ? "credit_note" : "receipt",
    );

    await bookingOps.notify(booking.user_id, booking.id, {
      event: `payment.${kind}`,
      title: kind === "refund" ? "Refund issued" : "Payment received",
      body: `${money(Math.abs(input.amount), booking.currency ?? "USD")} on booking ${booking.reference}.`,
    });
  },
};