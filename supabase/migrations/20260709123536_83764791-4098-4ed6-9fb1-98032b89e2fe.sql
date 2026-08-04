CREATE TABLE public.aviation_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent TEXT NOT NULL CHECK (intent IN ('book','quote','callback')),
  leg_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  passengers INTEGER,
  notes TEXT,
  source TEXT DEFAULT 'empty-legs',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aviation_inquiries TO authenticated;
GRANT ALL ON public.aviation_inquiries TO service_role;

ALTER TABLE public.aviation_inquiries ENABLE ROW LEVEL SECURITY;

-- Submissions come from anonymous website visitors as well as signed-in users.
-- The server function that inserts uses the service_role client, which bypasses
-- RLS. We still restrict all client-side reads to super admins.
CREATE POLICY "Super admins can view aviation inquiries"
  ON public.aviation_inquiries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can manage aviation inquiries"
  ON public.aviation_inquiries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_aviation_inquiries_updated_at
  BEFORE UPDATE ON public.aviation_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();