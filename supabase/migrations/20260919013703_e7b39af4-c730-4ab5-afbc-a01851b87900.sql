CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role_internal(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$$;
REVOKE ALL ON FUNCTION private.has_role_internal(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role_internal(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.has_role_internal(_user_id, _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.has_role_internal(_user_id, 'admin')
      OR private.has_role_internal(_user_id, 'super_admin')
$$;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.owns_booking_internal(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = _booking_id AND b.user_id = _user_id
    )
$$;
REVOKE ALL ON FUNCTION private.owns_booking_internal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owns_booking_internal(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owns_booking(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.owns_booking_internal(_booking_id, _user_id)
$$;
REVOKE ALL ON FUNCTION public.owns_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_booking(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.staff_update_booking_internal(
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
SET search_path = public, private, pg_temp
AS $$
DECLARE
  result public.bookings;
BEGIN
  IF NOT private.has_role_internal(auth.uid(), 'admin')
     AND NOT private.has_role_internal(auth.uid(), 'super_admin') THEN
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
REVOKE ALL ON FUNCTION private.staff_update_booking_internal(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_update_booking_internal(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) TO authenticated, service_role;

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
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.staff_update_booking_internal(
    _booking_id,
    _status,
    _amount_paid,
    _balance_due,
    _supplier_reference,
    _supplier_status,
    _assigned_to,
    _sla_due_at,
    _cancellation_reason
  )
$$;
REVOKE ALL ON FUNCTION public.staff_update_booking(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_update_booking(uuid, text, numeric, numeric, text, text, uuid, timestamptz, text) TO authenticated, service_role;