-- 1. Column-level lockdown on bookings for ordinary customers
REVOKE UPDATE ON public.bookings FROM authenticated;
GRANT UPDATE (title, details, trip_id, updated_at) ON public.bookings TO authenticated;

-- Staff-only booking mutation surface
CREATE OR REPLACE FUNCTION public.staff_update_booking(
  _booking_id uuid,
  _status text DEFAULT NULL,
  _amount_paid numeric DEFAULT NULL,
  _balance_due numeric DEFAULT NULL,
  _supplier_reference text DEFAULT NULL,
  _supplier_status text DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _sla_due_at timestamptz DEFAULT NULL,
  _cancellation_reason text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.bookings;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings b SET
    status = COALESCE(_status, b.status),
    amount_paid = COALESCE(_amount_paid, b.amount_paid),
    balance_due = COALESCE(_balance_due, b.balance_due),
    supplier_reference = COALESCE(_supplier_reference, b.supplier_reference),
    supplier_status = COALESCE(_supplier_status, b.supplier_status),
    assigned_to = COALESCE(_assigned_to, b.assigned_to),
    sla_due_at = COALESCE(_sla_due_at, b.sla_due_at),
    cancellation_reason = COALESCE(_cancellation_reason, b.cancellation_reason),
    updated_at = now()
  WHERE b.id = _booking_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_update_booking(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_update_booking(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) TO authenticated, service_role;

-- 2. Payments and instalment settlement are staff-only writes
DROP POLICY IF EXISTS "payments insert by owner or staff" ON public.booking_payments;
CREATE POLICY "payments insert by staff" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "installments updated by owner or staff" ON public.booking_installments;
CREATE POLICY "installments updated by staff" ON public.booking_installments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 3. Customers cannot forge timeline entries or internal notes
CREATE OR REPLACE FUNCTION public.enforce_booking_event_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    NEW.actor_id := auth.uid();
    NEW.actor_label := 'Customer';
    NEW.visibility := 'customer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_booking_events_actor BEFORE INSERT ON public.booking_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_event_actor();

CREATE OR REPLACE FUNCTION public.enforce_booking_message_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    NEW.author_id := auth.uid();
    NEW.internal := false;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_booking_messages_author BEFORE INSERT ON public.booking_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_message_author();

-- 4. Documents always belong to the real booking owner
CREATE OR REPLACE FUNCTION public.enforce_booking_document_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT b.user_id INTO NEW.user_id FROM public.bookings b WHERE b.id = NEW.booking_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_booking_documents_owner BEFORE INSERT ON public.booking_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_document_owner();