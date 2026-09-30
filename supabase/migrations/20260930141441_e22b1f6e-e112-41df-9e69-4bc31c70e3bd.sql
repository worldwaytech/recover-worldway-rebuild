CREATE OR REPLACE FUNCTION public.travelshop_catalogue_totals()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'tours', (SELECT count(*) FROM travelshop_tours WHERE is_active),
    'categories', (SELECT count(DISTINCT category_slug) FROM travelshop_tours WHERE is_active),
    'activities', (SELECT count(DISTINCT a) FROM travelshop_tours, unnest(activities) a WHERE is_active),
    'destinations', (SELECT count(DISTINCT d) FROM travelshop_tours, unnest(destinations) d WHERE is_active),
    'regions', (SELECT count(DISTINCT region) FROM travelshop_tours WHERE is_active),
    'countries', (SELECT count(DISTINCT country) FROM travelshop_tours WHERE is_active),
    'cities', (SELECT count(DISTINCT (country, start_location)) FROM travelshop_tours WHERE is_active AND start_location IS NOT NULL),
    'withPrice', (SELECT count(*) FROM travelshop_tours WHERE is_active AND price_from IS NOT NULL)
  )
$$;
REVOKE ALL ON FUNCTION public.travelshop_catalogue_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travelshop_catalogue_totals() TO service_role;