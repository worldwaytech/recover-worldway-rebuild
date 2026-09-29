ALTER TABLE public.private_aviation_requests DROP CONSTRAINT IF EXISTS private_aviation_requests_status_check;
ALTER TABLE public.private_aviation_requests ADD CONSTRAINT private_aviation_requests_status_check
  CHECK (status IN ('estimated','submitted','sourcing','options_sent','quoted','paid','booked','closed','failed'));
ALTER TABLE public.private_aviation_requests
  ADD COLUMN quote_amount numeric(14,2),
  ADD COLUMN quote_currency text,
  ADD COLUMN quote_details jsonb,
  ADD COLUMN quote_expires_at timestamptz,
  ADD COLUMN quoted_at timestamptz,
  ADD COLUMN quoted_by uuid,
  ADD COLUMN quote_version integer NOT NULL DEFAULT 0,
  ADD COLUMN payment_order_id text,
  ADD COLUMN payment_id text,
  ADD COLUMN paid_amount numeric(14,2),
  ADD COLUMN paid_currency text,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN receipt_number text UNIQUE,
  ADD COLUMN email_log jsonb NOT NULL DEFAULT '[]'::jsonb;