DROP TRIGGER IF EXISTS trg_cruisea_passengers_owner ON public.cruisea_booking_passengers;
DROP TRIGGER IF EXISTS trg_cruisea_documents_owner ON public.cruisea_booking_documents;
DROP TRIGGER IF EXISTS trg_cruisea_quotations_owner ON public.cruisea_quotations;
DROP FUNCTION IF EXISTS public.enforce_cruisea_child_owner();
DROP FUNCTION IF EXISTS public.owns_cruisea_booking(uuid, uuid);

CREATE OR REPLACE FUNCTION private.owns_cruisea_booking_internal(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cruisea_bookings b
    WHERE b.id = _booking_id AND b.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION private.owns_cruisea_booking_internal(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.enforce_cruisea_child_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.booking_id IS NOT NULL
     AND NOT private.owns_cruisea_booking_internal(NEW.booking_id, auth.uid()) THEN
    RAISE EXCEPTION 'Referenced cruise booking does not belong to the current user';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_cruisea_child_owner() FROM PUBLIC;

CREATE TRIGGER trg_cruisea_passengers_owner
BEFORE INSERT OR UPDATE ON public.cruisea_booking_passengers
FOR EACH ROW EXECUTE FUNCTION private.enforce_cruisea_child_owner();

CREATE TRIGGER trg_cruisea_documents_owner
BEFORE INSERT OR UPDATE ON public.cruisea_booking_documents
FOR EACH ROW EXECUTE FUNCTION private.enforce_cruisea_child_owner();

CREATE TRIGGER trg_cruisea_quotations_owner
BEFORE INSERT OR UPDATE ON public.cruisea_quotations
FOR EACH ROW EXECUTE FUNCTION private.enforce_cruisea_child_owner();