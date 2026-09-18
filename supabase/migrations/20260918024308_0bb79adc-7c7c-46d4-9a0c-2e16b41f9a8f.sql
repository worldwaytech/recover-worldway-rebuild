-- Production hardening for roles, bookings and the Universal Integration Ledger.

-- Super Admin role management remains protected by RLS, but now has the table privileges
-- required for the existing policy to be effective.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Future users are assigned only from safe requested roles. Existing administrator rows
-- remain untouched; the permanent email-string elevation path is removed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first BOOLEAN;
  desired_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  IF is_first THEN
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
$function$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Customer bookings are created only by verified server-side supplier/payment flows.
-- Customers retain read access and the existing narrow column-level edit grant.
REVOKE INSERT, DELETE ON public.bookings FROM authenticated;
DROP POLICY IF EXISTS bookings_own ON public.bookings;
DROP POLICY IF EXISTS "Customers manage own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users manage own bookings" ON public.bookings;
CREATE POLICY "Customers read own bookings"
ON public.bookings FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Customers edit allowed booking fields"
ON public.bookings FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage bookings"
ON public.bookings FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Provider configuration and normalized products are written through authenticated
-- server functions after staff authorization, never directly by ordinary clients.
REVOKE INSERT, UPDATE, DELETE ON public.integration_providers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_products FROM authenticated;
GRANT SELECT ON public.integration_providers, public.integration_settings, public.integration_products TO authenticated;
GRANT ALL ON public.integration_providers, public.integration_settings, public.integration_products TO service_role;

-- Enforce provider ledger integrity. Provider deletion is intentionally restricted so
-- sync and audit history cannot be orphaned.
ALTER TABLE public.integration_sync_runs
  ADD CONSTRAINT integration_sync_runs_provider_fk
  FOREIGN KEY (provider_key) REFERENCES public.integration_providers(provider_key)
  ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.integration_products
  ADD CONSTRAINT integration_products_provider_fk
  FOREIGN KEY (provider_key) REFERENCES public.integration_providers(provider_key)
  ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.integration_logs
  ADD CONSTRAINT integration_logs_provider_fk
  FOREIGN KEY (provider_key) REFERENCES public.integration_providers(provider_key)
  ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.integration_audit
  ADD CONSTRAINT integration_audit_provider_fk
  FOREIGN KEY (provider_key) REFERENCES public.integration_providers(provider_key)
  ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.integration_webhook_events
  ADD CONSTRAINT integration_webhook_events_provider_fk
  FOREIGN KEY (provider_key) REFERENCES public.integration_providers(provider_key)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.integration_webhook_events
  ADD COLUMN event_id text,
  ADD COLUMN payload_hash text,
  ADD COLUMN signature_algorithm text,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN processed_at timestamptz;
CREATE UNIQUE INDEX integration_webhook_events_provider_event_unique
  ON public.integration_webhook_events(provider_key, event_id)
  WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX integration_webhook_events_provider_payload_unique
  ON public.integration_webhook_events(provider_key, payload_hash)
  WHERE payload_hash IS NOT NULL;
CREATE INDEX integration_webhook_events_processing_idx
  ON public.integration_webhook_events(processed, received_at)
  WHERE processed = false;
CREATE INDEX integration_products_source_idx
  ON public.integration_products(source_table, external_id)
  WHERE source_table IS NOT NULL;
CREATE INDEX integration_products_sync_idx
  ON public.integration_products(provider_key, sync_status, updated_at DESC);
CREATE INDEX integration_runs_status_idx
  ON public.integration_sync_runs(provider_key, status, started_at DESC);
CREATE INDEX bookings_assigned_to_idx
  ON public.bookings(assigned_to, updated_at DESC)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX cruisea_bookings_sailing_idx ON public.cruisea_bookings(sailing_id);
CREATE INDEX cruisea_bookings_cabin_idx ON public.cruisea_bookings(cabin_id);

-- Staff support access for native Cruisea records. Customer ownership policies remain.
CREATE POLICY "Staff manage Cruisea bookings"
ON public.cruisea_bookings FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff read Cruisea passengers"
ON public.cruisea_booking_passengers FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read Cruisea documents"
ON public.cruisea_booking_documents FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read Cruisea quotations"
ON public.cruisea_quotations FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff read Cruisea customer profiles"
ON public.cruisea_customer_profiles FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

-- Keep privileged configuration and webhook payload access private to staff.
ALTER TABLE public.integration_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_webhook_events FORCE ROW LEVEL SECURITY;