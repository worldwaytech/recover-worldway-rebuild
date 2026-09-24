CREATE TABLE public.viator_merchant_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  partner_booking_ref text UNIQUE NOT NULL,
  partner_cart_ref text,
  cart_ref text,
  booking_ref text,
  product_code text NOT NULL,
  product_title text,
  option_code text,
  start_time text,
  travel_date date,
  language_guide text,
  traveller_count integer NOT NULL DEFAULT 1,
  retail_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'held',
  payment_status text NOT NULL DEFAULT 'sandbox_not_collected',
  voucher_url text,
  failure_reason text,
  cancellation jsonb,
  booker jsonb,
  audit jsonb,
  booked_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.viator_merchant_bookings TO authenticated;
GRANT ALL ON public.viator_merchant_bookings TO service_role;
ALTER TABLE public.viator_merchant_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own merchant bookings" ON public.viator_merchant_bookings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff view all merchant bookings" ON public.viator_merchant_bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));