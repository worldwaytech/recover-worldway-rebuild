-- Lock down SECURITY DEFINER helper functions so signed-in users cannot
-- invoke them for privilege discovery or accidental trigger execution.

-- 1) set_updated_at is a trigger helper — no client or RPC should call it.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 2) has_role must remain callable (RLS policies reference it), but callers
--    should only be able to check THEIR OWN role. Admin-facing role lookups
--    already go through the user_roles table with its own RLS.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deny cross-user role probing. Policies call has_role(auth.uid(), ...),
  -- and the client-side verified-role hook does the same.
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;