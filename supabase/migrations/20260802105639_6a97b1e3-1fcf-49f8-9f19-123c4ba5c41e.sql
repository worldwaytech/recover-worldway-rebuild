ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS supplier_reference TEXT,
  ADD COLUMN IF NOT EXISTS supplier_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.owns_booking(_booking_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = _booking_id AND b.user_id = _user_id)
$$;

CREATE TABLE public.booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  actor_label TEXT NOT NULL DEFAULT 'system',
  visibility TEXT NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_events TO authenticated;
GRANT ALL ON public.booking_events TO service_role;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events readable by owner or staff" ON public.booking_events FOR SELECT TO authenticated
  USING ((visibility = 'customer' AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "events insert by owner or staff" ON public.booking_events FOR INSERT TO authenticated
  WITH CHECK (public.owns_booking(booking_id, auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "events managed by staff" ON public.booking_events FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "events deleted by staff" ON public.booking_events FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'payment',
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL DEFAULT 'wallet',
  status TEXT NOT NULL DEFAULT 'settled',
  gateway_reference TEXT,
  idempotency_key TEXT UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated;
GRANT ALL ON public.booking_payments TO service_role;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments readable by owner or staff" ON public.booking_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "payments insert by owner or staff" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "payments updated by staff" ON public.booking_payments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments deleted by staff" ON public.booking_payments FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.booking_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'scheduled',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_installments TO authenticated;
GRANT ALL ON public.booking_installments TO service_role;
ALTER TABLE public.booking_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installments readable by owner or staff" ON public.booking_installments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "installments insert by owner or staff" ON public.booking_installments FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "installments updated by owner or staff" ON public.booking_installments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "installments deleted by staff" ON public.booking_installments FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.booking_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reference TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_documents TO authenticated;
GRANT ALL ON public.booking_documents TO service_role;
ALTER TABLE public.booking_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents readable by owner or staff" ON public.booking_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "documents insert by owner or staff" ON public.booking_documents FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "documents updated by staff" ON public.booking_documents FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "documents deleted by staff" ON public.booking_documents FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  author_id UUID,
  author_label TEXT NOT NULL DEFAULT 'Customer',
  body TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_messages TO authenticated;
GRANT ALL ON public.booking_messages TO service_role;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable by owner or staff" ON public.booking_messages FOR SELECT TO authenticated
  USING ((internal = false AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "messages insert by owner or staff" ON public.booking_messages FOR INSERT TO authenticated
  WITH CHECK ((internal = false AND public.owns_booking(booking_id, auth.uid()) AND author_id = auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "messages updated by staff" ON public.booking_messages FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "messages deleted by staff" ON public.booking_messages FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  request_type TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  refund_amount NUMERIC,
  handled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_requests TO authenticated;
GRANT ALL ON public.booking_requests TO service_role;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests readable by owner or staff" ON public.booking_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "requests insert by owner or staff" ON public.booking_requests FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND public.owns_booking(booking_id, auth.uid())) OR public.is_staff(auth.uid()));
CREATE POLICY "requests updated by staff" ON public.booking_requests FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "requests deleted by staff" ON public.booking_requests FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  event TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications readable by owner or staff" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "notifications insert by owner or staff" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "notifications updated by owner or staff" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "notifications deleted by owner or staff" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "staff can view all bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff can update all bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_booking_payments_updated BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_booking_installments_updated BEFORE UPDATE ON public.booking_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_booking_documents_updated BEFORE UPDATE ON public.booking_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_booking_requests_updated BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_booking_events_booking ON public.booking_events(booking_id, created_at DESC);
CREATE INDEX idx_booking_payments_booking ON public.booking_payments(booking_id, created_at DESC);
CREATE INDEX idx_booking_documents_booking ON public.booking_documents(booking_id);
CREATE INDEX idx_booking_messages_booking ON public.booking_messages(booking_id, created_at);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);