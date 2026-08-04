CREATE TABLE public.up17_hotel_cities (
  id bigserial PRIMARY KEY,
  city_id text NOT NULL,
  destination text NOT NULL,
  state_province text,
  state_province_code text,
  country text,
  country_code text,
  priority integer NOT NULL DEFAULT 0
);
CREATE TABLE public.up17_bus_cities (
  id bigserial PRIMARY KEY,
  city_id text NOT NULL,
  city_name text NOT NULL,
  priority integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.up17_hotel_cities TO anon;
GRANT SELECT ON public.up17_hotel_cities TO authenticated;
GRANT ALL ON public.up17_hotel_cities TO service_role;
GRANT SELECT ON public.up17_bus_cities TO anon;
GRANT SELECT ON public.up17_bus_cities TO authenticated;
GRANT ALL ON public.up17_bus_cities TO service_role;
ALTER TABLE public.up17_hotel_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.up17_bus_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read hotel cities" ON public.up17_hotel_cities FOR SELECT USING (true);
CREATE POLICY "Anyone can read bus cities" ON public.up17_bus_cities FOR SELECT USING (true);
CREATE INDEX up17_hotel_cities_dest_lower_idx ON public.up17_hotel_cities (lower(destination));
CREATE INDEX up17_hotel_cities_trgm_idx ON public.up17_hotel_cities (lower(destination) text_pattern_ops);
CREATE INDEX up17_hotel_cities_city_id_idx ON public.up17_hotel_cities (city_id);
CREATE INDEX up17_bus_cities_name_lower_idx ON public.up17_bus_cities (lower(city_name));
CREATE INDEX up17_bus_cities_trgm_idx ON public.up17_bus_cities (lower(city_name) text_pattern_ops);
CREATE INDEX up17_bus_cities_city_id_idx ON public.up17_bus_cities (city_id);