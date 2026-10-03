CREATE TABLE public.payment_account_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.partner_tenants(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('b2c','b2b','agent','enterprise','corporate','company','hni','uhni','white_label','partner')),
  credit_enabled boolean NOT NULL DEFAULT false,
  credit_limit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  invoice_terms_days integer NOT NULL DEFAULT 0 CHECK (invoice_terms_days BETWEEN 0 AND 365),
  max_transaction_minor bigint NOT NULL DEFAULT 2000000000 CHECK (max_transaction_minor > 0),
  approval_above_minor bigint,
  allowed_methods text[] NOT NULL DEFAULT ARRAY['razorpay','wallet','bank_transfer']::text[],
  currency text NOT NULL DEFAULT 'INR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (tenant_id IS NOT NULL)),
  CHECK ((credit_enabled AND credit_limit_minor > 0) OR NOT credit_enabled),
  CHECK (approval_above_minor IS NULL OR approval_above_minor > 0),
  UNIQUE NULLS NOT DISTINCT (user_id, tenant_id)
);

CREATE INDEX payment_account_policies_user_idx ON public.payment_account_policies (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX payment_account_policies_tenant_idx ON public.payment_account_policies (tenant_id) WHERE tenant_id IS NOT NULL;

GRANT SELECT ON public.payment_account_policies TO authenticated;
GRANT ALL ON public.payment_account_policies TO service_role;
ALTER TABLE public.payment_account_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and staff read payment policy"
  ON public.payment_account_policies FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR public.is_staff(auth.uid())
    OR (tenant_id IS NOT NULL AND public.is_partner_member(tenant_id, auth.uid()))
  );

CREATE TRIGGER payment_account_policies_updated_at
  BEFORE UPDATE ON public.payment_account_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.payment_account_policies IS 'Authoritative Worldway commercial terms above the provider layer. Razorpay, Wallet, bank transfer and future providers remain execution methods.';
