GRANT SELECT ON public.payment_fee_policies TO anon;
CREATE POLICY "Anyone can read payment fee rules" ON public.payment_fee_policies
  FOR SELECT TO anon, authenticated USING (true);