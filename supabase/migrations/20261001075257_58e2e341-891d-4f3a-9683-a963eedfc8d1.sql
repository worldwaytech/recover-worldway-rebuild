DROP POLICY IF EXISTS "Anyone can read payment fee rules" ON public.payment_fee_policies;
REVOKE SELECT ON public.payment_fee_policies FROM anon;

CREATE OR REPLACE FUNCTION public.checkout_fee_rules()
RETURNS TABLE(product text, method text, mode text, service_fee_percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p.product::text, p.method::text, p.mode::text, p.service_fee_percent::numeric FROM public.payment_fee_policies p $$;

REVOKE ALL ON FUNCTION public.checkout_fee_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_fee_rules() TO anon, authenticated, service_role;