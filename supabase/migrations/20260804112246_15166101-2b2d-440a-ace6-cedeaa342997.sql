-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'agent', 'b2b', 'b2c');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  company TEXT,
  phone TEXT,
  tier TEXT DEFAULT 'traveler',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Trigger: create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
  desired_role public.app_role;
  is_bootstrap_admin BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  is_bootstrap_admin := lower(NEW.email) = 'worldwaytravelsgroup@gmail.com';

  IF is_first OR is_bootstrap_admin THEN
    desired_role := 'super_admin';
  ELSE
    desired_role := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'requested_role', '')::public.app_role,
      'b2c'
    );
    IF desired_role IN ('super_admin', 'admin') THEN
      desired_role := 'b2c';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, desired_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helpers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Prevent tier self-service
CREATE OR REPLACE FUNCTION public.prevent_tier_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Membership tier can only be changed by an administrator or verified payment webhook';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_tier_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tier_self_update();
REVOKE EXECUTE ON FUNCTION public.prevent_tier_self_update() FROM PUBLIC, anon, authenticated;

-- Aviation inquiries
CREATE TABLE public.aviation_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent TEXT NOT NULL CHECK (intent IN ('book','quote','callback')),
  leg_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  passengers INTEGER,
  notes TEXT,
  source TEXT DEFAULT 'empty-legs',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aviation_inquiries TO authenticated;
GRANT ALL ON public.aviation_inquiries TO service_role;
ALTER TABLE public.aviation_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view aviation inquiries"
  ON public.aviation_inquiries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins can manage aviation inquiries"
  ON public.aviation_inquiries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE TRIGGER trg_aviation_inquiries_updated_at
  BEFORE UPDATE ON public.aviation_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trips
CREATE TABLE public.trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planning',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_own" ON public.trips FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trips_updated_at BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX trips_user_idx ON public.trips (user_id, start_date DESC);

-- bookings
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  product_type TEXT NOT NULL,
  title TEXT NOT NULL,
  travel_date DATE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  supplier TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplier_reference TEXT,
  supplier_status TEXT NOT NULL DEFAULT 'pending',
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  deposit_amount NUMERIC,
  assigned_to UUID,
  sla_due_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.bookings TO authenticated;
GRANT UPDATE (title, details, trip_id, updated_at) ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_own" ON public.bookings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX bookings_user_idx ON public.bookings (user_id, travel_date DESC);

-- saved_items
CREATE TABLE public.saved_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  label TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_items TO authenticated;
GRANT ALL ON public.saved_items TO service_role;
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_items_own" ON public.saved_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER saved_items_updated_at BEFORE UPDATE ON public.saved_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX saved_items_user_idx ON public.saved_items (user_id, created_at DESC);

-- travellers
CREATE TABLE public.travellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  passport_number TEXT,
  passport_expiry DATE,
  frequent_flyer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travellers TO authenticated;
GRANT ALL ON public.travellers TO service_role;
ALTER TABLE public.travellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travellers_own" ON public.travellers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER travellers_updated_at BEFORE UPDATE ON public.travellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX travellers_user_idx ON public.travellers (user_id, full_name);

-- documents
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT,
  expires_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_own" ON public.documents FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX documents_user_idx ON public.documents (user_id, created_at DESC);

-- notification_preferences
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  marketing_enabled BOOLEAN NOT NULL DEFAULT false,
  trip_alerts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_preferences_own" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- contact_messages
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  category text NOT NULL DEFAULT 'general',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon;
GRANT SELECT, INSERT, UPDATE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a contact message"
  ON public.contact_messages FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "Admins can read contact messages"
  ON public.contact_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update contact messages"
  ON public.contact_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER update_contact_messages_updated_at
  BEFORE UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- quote_requests
CREATE TABLE public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_kind text NOT NULL,
  product_slug text NOT NULL,
  product_title text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  travel_month text,
  party_size integer,
  budget text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.quote_requests TO anon;
GRANT SELECT, INSERT ON public.quote_requests TO authenticated;
GRANT ALL ON public.quote_requests TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone may request a quote" ON public.quote_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Members read their own quote requests" ON public.quote_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- catalogue_events
CREATE TABLE public.catalogue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  kind text,
  slug text,
  query text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.catalogue_events TO anon;
GRANT INSERT ON public.catalogue_events TO authenticated;
GRANT ALL ON public.catalogue_events TO service_role;
ALTER TABLE public.catalogue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone may record catalogue analytics" ON public.catalogue_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE INDEX catalogue_events_type_idx ON public.catalogue_events (event_type, created_at DESC);

-- staff helpers
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.owns_booking(_booking_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = _booking_id AND b.user_id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_booking(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "staff can view all bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff can update all bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- booking_events
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

-- booking_payments
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
CREATE POLICY "payments insert by staff" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments updated by staff" ON public.booking_payments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments deleted by staff" ON public.booking_payments FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- booking_installments
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
CREATE POLICY "installments updated by staff" ON public.booking_installments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "installments deleted by staff" ON public.booking_installments FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- booking_documents
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

-- booking_messages
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

-- booking_requests
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

-- notifications
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

-- Integrity triggers
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

CREATE OR REPLACE FUNCTION public.enforce_booking_document_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT b.user_id INTO NEW.user_id FROM public.bookings b WHERE b.id = NEW.booking_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_booking_documents_owner BEFORE INSERT ON public.booking_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_document_owner();

REVOKE EXECUTE ON FUNCTION public.enforce_booking_event_actor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_message_author() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_document_owner() FROM PUBLIC, anon, authenticated;