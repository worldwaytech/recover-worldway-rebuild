CREATE OR REPLACE FUNCTION public.owns_cruisea_booking(_booking_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cruisea_bookings b
    WHERE b.id = _booking_id AND b.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.owns_cruisea_booking(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_cruisea_booking(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_cruisea_child_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.booking_id IS NOT NULL
     AND NOT public.owns_cruisea_booking(NEW.booking_id, auth.uid()) THEN
    RAISE EXCEPTION 'Referenced cruise booking does not belong to the current user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cruisea_passengers_owner ON public.cruisea_booking_passengers;
CREATE TRIGGER trg_cruisea_passengers_owner
BEFORE INSERT OR UPDATE ON public.cruisea_booking_passengers
FOR EACH ROW EXECUTE FUNCTION public.enforce_cruisea_child_owner();

DROP TRIGGER IF EXISTS trg_cruisea_documents_owner ON public.cruisea_booking_documents;
CREATE TRIGGER trg_cruisea_documents_owner
BEFORE INSERT OR UPDATE ON public.cruisea_booking_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_cruisea_child_owner();

DROP TRIGGER IF EXISTS trg_cruisea_quotations_owner ON public.cruisea_quotations;
CREATE TRIGGER trg_cruisea_quotations_owner
BEFORE INSERT OR UPDATE ON public.cruisea_quotations
FOR EACH ROW EXECUTE FUNCTION public.enforce_cruisea_child_owner();