CREATE TABLE public.bokun_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  city TEXT,
  country TEXT,
  duration_text TEXT,
  price_from NUMERIC,
  currency TEXT,
  cover_photo TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bokun_products TO anon;
GRANT SELECT ON public.bokun_products TO authenticated;
GRANT ALL ON public.bokun_products TO service_role;
ALTER TABLE public.bokun_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view tour catalogue" ON public.bokun_products FOR SELECT TO anon, authenticated USING (true);