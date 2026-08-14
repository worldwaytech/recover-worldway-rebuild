ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'razorpay';

CREATE INDEX IF NOT EXISTS payments_provider_idx ON public.payments (provider);

CREATE TABLE IF NOT EXISTS public.viator_activity_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cart_reference TEXT NOT NULL,
  booking_reference TEXT,
  itinerary_reference TEXT,
  product_code TEXT NOT NULL,
  product_title TEXT,
  travel_date DATE,
  traveller_count INTEGER NOT NULL DEFAULT 1,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'held',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  customer_email TEXT,
  customer_phone TEXT,
  billing_country TEXT,
  billing_postal_code TEXT,
  hold_expires_at TIMESTAMP WITH TIME ZONE,
  session_expires_at TIMESTAMP WITH TIME ZONE,
  booked_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  audit JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS viator_activity_bookings_cart_ref_key
  ON public.viator_activity_bookings (cart_reference);
CREATE UNIQUE INDEX IF NOT EXISTS viator_activity_bookings_booking_ref_key
  ON public.viator_activity_bookings (booking_reference)
  WHERE booking_reference IS NOT NULL;

GRANT SELECT ON public.viator_activity_bookings TO authenticated;
GRANT ALL ON public.viator_activity_bookings TO service_role;

ALTER TABLE public.viator_activity_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read their own activity bookings"
  ON public.viator_activity_bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Staff read all activity bookings"
  ON public.viator_activity_bookings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER viator_activity_bookings_updated_at
  BEFORE UPDATE ON public.viator_activity_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();