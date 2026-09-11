CREATE TABLE public.cruisea_sailings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  cruise_line text NOT NULL,
  ship_name text NOT NULL,
  cruise_type text NOT NULL CHECK (cruise_type = ANY (ARRAY['Ocean','River','Luxury','Expedition'])),
  region text NOT NULL,
  country text NOT NULL,
  embarkation_port text NOT NULL,
  disembarkation_port text NOT NULL,
  departure_date date NOT NULL,
  duration_nights integer NOT NULL CHECK (duration_nights > 0),
  description text NOT NULL,
  highlights text[] NOT NULL DEFAULT '{}'::text[],
  image_url text,
  is_demo boolean NOT NULL DEFAULT true,
  area_tags text[] NOT NULL DEFAULT '{}'::text[],
  package_options text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cruisea_sailings TO anon;
GRANT SELECT ON public.cruisea_sailings TO authenticated;
GRANT ALL ON public.cruisea_sailings TO service_role;
ALTER TABLE public.cruisea_sailings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can browse cruisea sailings" ON public.cruisea_sailings FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.cruisea_cabins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sailing_id uuid NOT NULL REFERENCES public.cruisea_sailings(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category = ANY (ARRAY['Inside','Oceanview','Balcony','Suite'])),
  label text NOT NULL,
  price_per_guest numeric(12,2) NOT NULL CHECK (price_per_guest >= 0),
  available_inventory integer NOT NULL CHECK (available_inventory >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruisea_cabins_sailing_idx ON public.cruisea_cabins (sailing_id);
GRANT SELECT ON public.cruisea_cabins TO anon;
GRANT SELECT ON public.cruisea_cabins TO authenticated;
GRANT ALL ON public.cruisea_cabins TO service_role;
ALTER TABLE public.cruisea_cabins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can browse cruisea cabins" ON public.cruisea_cabins FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.cruisea_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sailing_id uuid NOT NULL REFERENCES public.cruisea_sailings(id),
  cabin_id uuid NOT NULL REFERENCES public.cruisea_cabins(id),
  status text NOT NULL DEFAULT 'Inquiry' CHECK (status = ANY (ARRAY['Inquiry','Held','Confirmed','Cancelled'])),
  guest_count integer NOT NULL CHECK (guest_count > 0),
  total_price numeric(12,2) NOT NULL CHECK (total_price >= 0),
  net_price numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  notes text,
  booking_reference text,
  payment_status text NOT NULL DEFAULT 'Pending',
  hold_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cruisea_bookings_reference_key ON public.cruisea_bookings (booking_reference) WHERE booking_reference IS NOT NULL;
CREATE INDEX cruisea_bookings_user_idx ON public.cruisea_bookings (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_bookings TO authenticated;
GRANT ALL ON public.cruisea_bookings TO service_role;
ALTER TABLE public.cruisea_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea bookings" ON public.cruisea_bookings FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "Users can create their own cruisea bookings" ON public.cruisea_bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea bookings" ON public.cruisea_bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea bookings" ON public.cruisea_bookings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.cruisea_booking_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.cruisea_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruisea_booking_passengers_booking_idx ON public.cruisea_booking_passengers (booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_booking_passengers TO authenticated;
GRANT ALL ON public.cruisea_booking_passengers TO service_role;
ALTER TABLE public.cruisea_booking_passengers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea passengers" ON public.cruisea_booking_passengers FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "Users can add their own cruisea passengers" ON public.cruisea_booking_passengers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea passengers" ON public.cruisea_booking_passengers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea passengers" ON public.cruisea_booking_passengers FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.cruisea_booking_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.cruisea_bookings(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text NOT NULL,
  document_url text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cruisea_booking_documents_booking_idx ON public.cruisea_booking_documents (booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_booking_documents TO authenticated;
GRANT ALL ON public.cruisea_booking_documents TO service_role;
ALTER TABLE public.cruisea_booking_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea documents" ON public.cruisea_booking_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cruisea documents" ON public.cruisea_booking_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea documents" ON public.cruisea_booking_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea documents" ON public.cruisea_booking_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.cruisea_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.cruisea_bookings(id) ON DELETE SET NULL,
  title text NOT NULL,
  customer_name text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  currency text NOT NULL DEFAULT 'USD',
  net_price numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  gross_price numeric NOT NULL DEFAULT 0,
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_quotations TO authenticated;
GRANT ALL ON public.cruisea_quotations TO service_role;
ALTER TABLE public.cruisea_quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea quotations" ON public.cruisea_quotations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cruisea quotations" ON public.cruisea_quotations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea quotations" ON public.cruisea_quotations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea quotations" ON public.cruisea_quotations FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.cruisea_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  query text,
  cruise_type text,
  region text,
  departure_window text,
  company text,
  ship text,
  duration text,
  departure_date date,
  package_filters text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_saved_searches TO authenticated;
GRANT ALL ON public.cruisea_saved_searches TO service_role;
ALTER TABLE public.cruisea_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea saved searches" ON public.cruisea_saved_searches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cruisea saved searches" ON public.cruisea_saved_searches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea saved searches" ON public.cruisea_saved_searches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea saved searches" ON public.cruisea_saved_searches FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.cruisea_customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  company_name text,
  agency_code text,
  preferred_currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruisea_customer_profiles TO authenticated;
GRANT ALL ON public.cruisea_customer_profiles TO service_role;
ALTER TABLE public.cruisea_customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own cruisea profile" ON public.cruisea_customer_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cruisea profile" ON public.cruisea_customer_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cruisea profile" ON public.cruisea_customer_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cruisea profile" ON public.cruisea_customer_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER cruisea_sailings_updated_at BEFORE UPDATE ON public.cruisea_sailings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_cabins_updated_at BEFORE UPDATE ON public.cruisea_cabins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_bookings_updated_at BEFORE UPDATE ON public.cruisea_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_booking_passengers_updated_at BEFORE UPDATE ON public.cruisea_booking_passengers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_booking_documents_updated_at BEFORE UPDATE ON public.cruisea_booking_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_quotations_updated_at BEFORE UPDATE ON public.cruisea_quotations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_saved_searches_updated_at BEFORE UPDATE ON public.cruisea_saved_searches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cruisea_customer_profiles_updated_at BEFORE UPDATE ON public.cruisea_customer_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cruisea_sailings (id, title, cruise_line, ship_name, cruise_type, region, country, embarkation_port, disembarkation_port, departure_date, duration_nights, description, highlights, image_url, is_demo, area_tags, package_options) VALUES
('2e7d3a10-3af2-4cc1-8d2b-001000000001','Greek Isles & Adriatic','Aegean Meridian','MV Calypso','Ocean','Mediterranean','Greece','Athens','Venice','2027-05-15',10,'Sunlit islands, old ports, and an easy westbound rhythm through the Adriatic.','{"Santorini sunset","Dubrovnik old town","Small-ship dining"}',NULL,true,'{Europe,Mediterranean,"Central Mediterranean","Eastern Mediterranean"}','{Supplements}'),
('2e7d3a10-3af2-4cc1-8d2b-001000000002','Danube Grand Passage','Blue Current River','MS Aria','River','Europe','Austria','Vienna','Budapest','2027-06-07',7,'A refined river journey through imperial capitals, vineyards, and riverside villages.','{"Vienna concert","Wachau Valley","Budapest evening cruise"}',NULL,true,'{Europe,"North Europe","West Europe"}','{Hotel,Arrival}'),
('2e7d3a10-3af2-4cc1-8d2b-001000000003','Alaska Inside Passage','Northstar Voyages','Northstar Aurora','Expedition','Alaska','United States','Juneau','Seward','2027-07-22',8,'Glaciers, forested islands, and close-up wildlife viewing on an expedition-style sailing.','{"Glacier viewing","Whale spotting","Naturalist guides"}',NULL,true,'{America,"North America",Alaska,"North America West Coast"}','{Arrival}'),
('2e7d3a10-3af2-4cc1-8d2b-001000000004','French Polynesia Escape','Maison Oceanique','Le Serein','Luxury','South Pacific','Tahiti','Papeete','Bora Bora','2027-08-11',6,'Quiet luxury, lagoon days, and an intimate yacht-style experience across the Society Islands.','{"Private lagoon time","Open-air spa","Waterfront suites"}',NULL,true,'{Pacific,"South Pacific"}','{Supplements,Hotel}'),
('2e7d3a10-3af2-4cc1-8d2b-001000000005','Caribbean Weekend Atlas','Harborline Cruises','Harborline Sol','Ocean','Caribbean','United States','Miami','Miami','2027-04-02',3,'A compact warm-weather escape with bright beaches and simple weekend logistics.','{Cozumel,"Private island day","Family-friendly deck"}',NULL,true,'{America,"North America",Caribbean,"Western Caribbean"}','{Hotel}'),
('2e7d3a10-3af2-4cc1-8d2b-001000000006','Norway & the Arctic Circle','Polar Meridian','PM Resolute','Expedition','Northern Europe','Norway','Tromsø','Tromsø','2027-09-19',11,'A northbound adventure along fjords and high-latitude coastlines under long evening light.','{Geirangerfjord,"Arctic Circle crossing","Hiking landings"}',NULL,true,'{Europe,"North Europe","Norwegian Fjords",Arctic,"North Cape"}','{Supplements,Arrival}');

INSERT INTO public.cruisea_cabins (id, sailing_id, category, label, price_per_guest, available_inventory) VALUES
('3e7d3a10-3af2-4cc1-8d2b-001000000001','2e7d3a10-3af2-4cc1-8d2b-001000000001','Inside','Classic inside',1299.00,18),
('3e7d3a10-3af2-4cc1-8d2b-001000000002','2e7d3a10-3af2-4cc1-8d2b-001000000001','Balcony','Aegean balcony',2199.00,9),
('3e7d3a10-3af2-4cc1-8d2b-001000000003','2e7d3a10-3af2-4cc1-8d2b-001000000002','Oceanview','River view',1699.00,12),
('3e7d3a10-3af2-4cc1-8d2b-001000000004','2e7d3a10-3af2-4cc1-8d2b-001000000002','Suite','Panorama suite',2899.00,4),
('3e7d3a10-3af2-4cc1-8d2b-001000000005','2e7d3a10-3af2-4cc1-8d2b-001000000003','Oceanview','Explorer oceanview',2499.00,8),
('3e7d3a10-3af2-4cc1-8d2b-001000000006','2e7d3a10-3af2-4cc1-8d2b-001000000003','Suite','Glacier suite',4199.00,3),
('3e7d3a10-3af2-4cc1-8d2b-001000000007','2e7d3a10-3af2-4cc1-8d2b-001000000004','Balcony','Lagoon balcony',3799.00,6),
('3e7d3a10-3af2-4cc1-8d2b-001000000008','2e7d3a10-3af2-4cc1-8d2b-001000000004','Suite','Overwater suite',6299.00,2),
('3e7d3a10-3af2-4cc1-8d2b-001000000009','2e7d3a10-3af2-4cc1-8d2b-001000000005','Inside','Weekend inside',699.00,24),
('3e7d3a10-3af2-4cc1-8d2b-001000000010','2e7d3a10-3af2-4cc1-8d2b-001000000005','Balcony','Sun deck balcony',1099.00,10),
('3e7d3a10-3af2-4cc1-8d2b-001000000011','2e7d3a10-3af2-4cc1-8d2b-001000000006','Oceanview','Fjord view',2999.00,7),
('3e7d3a10-3af2-4cc1-8d2b-001000000012','2e7d3a10-3af2-4cc1-8d2b-001000000006','Suite','Arctic suite',4999.00,3);