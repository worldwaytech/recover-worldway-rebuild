
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

DROP TRIGGER IF EXISTS profiles_prevent_tier_self_update ON public.profiles;
CREATE TRIGGER profiles_prevent_tier_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tier_self_update();
