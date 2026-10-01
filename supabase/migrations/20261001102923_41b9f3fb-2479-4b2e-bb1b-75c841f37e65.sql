CREATE OR REPLACE FUNCTION public.intel_outcome_from_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE ev text; sk text; k text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'travel_bookings' THEN
    ev := CASE NEW.status WHEN 'confirmed' THEN 'booked' WHEN 'supplier_failed' THEN 'failed' WHEN 'cancelled' THEN 'cancelled' END;
    sk := CASE WHEN NEW.product = 'cruise' THEN 'crystal' ELSE 'up17' END;
    k := CASE NEW.product WHEN 'hotel' THEN 'stay' WHEN 'bus' THEN 'transport' ELSE NEW.product END;
  ELSE
    ev := CASE NEW.status WHEN 'supplier_booked' THEN 'booked' WHEN 'supplier_failed' THEN 'failed' WHEN 'supplier_rejected' THEN 'failed' WHEN 'cancelled' THEN 'cancelled' END;
    sk := 'travelshop'; k := 'activity';
  END IF;
  IF ev IS NOT NULL THEN
    INSERT INTO public.intel_outcomes (supplier_key, kind, event, ref)
    VALUES (sk, k, ev, TG_TABLE_NAME || ':' || NEW.id) ON CONFLICT (event, ref) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.intel_outcome_from_booking() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER travel_bookings_intel_outcome AFTER INSERT OR UPDATE OF status ON public.travel_bookings FOR EACH ROW EXECUTE FUNCTION public.intel_outcome_from_booking();
CREATE TRIGGER travelshop_bookings_intel_outcome AFTER INSERT OR UPDATE OF status ON public.travelshop_bookings FOR EACH ROW EXECUTE FUNCTION public.intel_outcome_from_booking();

CREATE POLICY "Staff read catalogue journeys" ON public.aktg_journeys FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));