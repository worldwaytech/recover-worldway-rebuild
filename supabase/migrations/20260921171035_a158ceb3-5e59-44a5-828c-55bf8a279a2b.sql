-- 1. Role reassignment
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role FROM auth.users u
WHERE u.email = 'worldwaytravelsgroup@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles r
USING auth.users u
WHERE r.user_id = u.id
  AND u.email = 'worldwaytravelsgroup@gmail.com'
  AND r.role <> 'super_admin'::public.app_role;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'b2c'::public.app_role FROM auth.users u
WHERE u.email = 'cruisea.qa@worldwaytravelsgroup.com'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles r
USING auth.users u
WHERE r.user_id = u.id
  AND u.email = 'cruisea.qa@worldwaytravelsgroup.com'
  AND r.role IN ('super_admin'::public.app_role, 'admin'::public.app_role);

-- 2. Remove destructive TRUNCATE rights (RLS and all other privileges unchanged)
REVOKE TRUNCATE ON public.bookings FROM anon, authenticated, PUBLIC;
REVOKE TRUNCATE ON public.integration_providers FROM anon, authenticated, PUBLIC;
REVOKE TRUNCATE ON public.integration_products FROM anon, authenticated, PUBLIC;

-- anon must never write booking or supplier records
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.integration_providers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.integration_products FROM anon;