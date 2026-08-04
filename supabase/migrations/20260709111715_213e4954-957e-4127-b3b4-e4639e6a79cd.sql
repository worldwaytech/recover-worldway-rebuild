
-- Ensure worldwaytravelsgroup@gmail.com is always super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- If the bootstrap admin already exists, grant super_admin now.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'worldwaytravelsgroup@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
