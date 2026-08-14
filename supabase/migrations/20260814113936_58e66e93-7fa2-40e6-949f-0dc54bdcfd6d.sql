CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  plan_id text,
  order_id text NOT NULL,
  payment_id text,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  description text,
  customer_email text,
  customer_phone text,
  reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  provider_payload jsonb,
  verified_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  fulfilment_reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payments_order_id_key ON public.payments (order_id);
CREATE UNIQUE INDEX payments_payment_id_key ON public.payments (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX payments_user_id_idx ON public.payments (user_id);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own payments"
ON public.payments FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all payments"
ON public.payments FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE TRIGGER payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();