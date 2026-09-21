-- Prevent duplicate staff payments from the same request being recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_idempotency_key_uidx
  ON public.booking_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Atomic staff payment recording: payment row, booking balances, instalment and
-- timeline event all commit together, or nothing does.
CREATE OR REPLACE FUNCTION private.record_staff_payment_internal(
  _booking_id uuid,
  _amount numeric,
  _kind text DEFAULT 'payment',
  _method text DEFAULT 'manual',
  _gateway_reference text DEFAULT NULL,
  _note text DEFAULT NULL,
  _installment_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings;
  existing public.booking_payments;
  signed numeric;
  new_paid numeric;
  new_balance numeric;
  payment_id uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only Worldway staff can record payments';
  END IF;
  IF _kind NOT IN ('payment', 'deposit', 'refund') THEN
    RAISE EXCEPTION 'Unsupported payment kind %', _kind;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.booking_payments WHERE idempotency_key = _idempotency_key;
    IF existing.id IS NOT NULL THEN
      RETURN b;
    END IF;
  END IF;

  signed := CASE WHEN _kind = 'refund' THEN -abs(_amount) ELSE abs(_amount) END;

  INSERT INTO public.booking_payments (
    booking_id, user_id, kind, amount, currency, method, status,
    gateway_reference, idempotency_key, note
  ) VALUES (
    b.id, b.user_id, _kind, abs(_amount), COALESCE(b.currency, 'USD'),
    COALESCE(_method, 'manual'), 'succeeded', _gateway_reference, _idempotency_key, _note
  ) RETURNING id INTO payment_id;

  new_paid := GREATEST(0, COALESCE(b.amount_paid, 0) + signed);
  new_balance := GREATEST(0, COALESCE(b.amount, 0) - new_paid);

  UPDATE public.bookings
     SET amount_paid = new_paid,
         balance_due = new_balance,
         status = CASE
           WHEN _kind <> 'refund' AND new_balance = 0 AND COALESCE(amount, 0) > 0 THEN 'confirmed'
           WHEN _kind <> 'refund' AND new_paid > 0 AND new_balance > 0 THEN 'deposit-paid'
           ELSE status
         END
   WHERE id = b.id
   RETURNING * INTO b;

  IF _installment_id IS NOT NULL THEN
    UPDATE public.booking_installments
       SET status = 'paid', paid_at = now()
     WHERE id = _installment_id AND booking_id = b.id;
  END IF;

  INSERT INTO public.booking_events (booking_id, event_type, summary, detail, actor_label, visibility)
  VALUES (
    b.id,
    'payment.' || _kind,
    initcap(_kind) || ' of ' || to_char(abs(_amount), 'FM999999990.00') || ' ' || COALESCE(b.currency, 'USD') || ' recorded',
    jsonb_build_object('payment_id', payment_id, 'method', COALESCE(_method, 'manual')),
    'Worldway payments',
    'customer'
  );

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_staff_payment(
  _booking_id uuid,
  _amount numeric,
  _kind text DEFAULT 'payment',
  _method text DEFAULT 'manual',
  _gateway_reference text DEFAULT NULL,
  _note text DEFAULT NULL,
  _installment_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE sql
SET search_path = public, private, pg_temp
AS $$
  SELECT private.record_staff_payment_internal(
    _booking_id, _amount, _kind, _method, _gateway_reference, _note, _installment_id, _idempotency_key
  )
$$;

REVOKE ALL ON FUNCTION public.record_staff_payment(uuid, numeric, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_payment(uuid, numeric, text, text, text, text, uuid, text) TO authenticated, service_role;

-- Cancellation preserves history instead of deleting rows.
CREATE OR REPLACE FUNCTION private.cancel_booking_internal(
  _booking_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings;
  staff boolean;
BEGIN
  staff := public.is_staff(auth.uid());
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF NOT staff AND b.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only cancel your own booking';
  END IF;
  IF b.status = 'cancelled' THEN
    RETURN b;
  END IF;

  UPDATE public.bookings
     SET status = CASE WHEN staff THEN 'cancelled' ELSE 'cancellation-requested' END,
         cancellation_reason = COALESCE(_reason, cancellation_reason)
   WHERE id = b.id
   RETURNING * INTO b;

  INSERT INTO public.booking_events (booking_id, event_type, summary, detail, actor_label, visibility)
  VALUES (
    b.id,
    CASE WHEN staff THEN 'booking.cancelled' ELSE 'booking.cancellation_requested' END,
    CASE WHEN staff THEN 'Booking cancelled' ELSE 'Cancellation requested by customer' END,
    jsonb_build_object('reason', _reason),
    CASE WHEN staff THEN 'Worldway operations' ELSE 'Customer' END,
    'customer'
  );

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _reason text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE sql
SET search_path = public, private, pg_temp
AS $$
  SELECT private.cancel_booking_internal(_booking_id, _reason)
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated, service_role;