ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_idempotency_key_uq ON public.bookings (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_product_type_idx ON public.bookings (product_type);