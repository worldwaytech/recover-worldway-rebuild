CREATE TABLE public.payment_fee_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  method text NOT NULL DEFAULT '*',
  mode text NOT NULL DEFAULT 'absorb' CHECK (mode IN ('absorb','pass_through')),
  service_fee_percent numeric NOT NULL DEFAULT 0 CHECK (service_fee_percent >= 0 AND service_fee_percent <= 10),
  note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, method)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_fee_policies TO authenticated;
GRANT ALL ON public.payment_fee_policies TO service_role;
ALTER TABLE public.payment_fee_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage payment fee policies" ON public.payment_fee_policies
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER payment_fee_policies_updated_at BEFORE UPDATE ON public.payment_fee_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();