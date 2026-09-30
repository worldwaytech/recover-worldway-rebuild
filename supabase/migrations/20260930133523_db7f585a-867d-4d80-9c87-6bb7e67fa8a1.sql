CREATE OR REPLACE FUNCTION public.travelshop_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', (SELECT coalesce(jsonb_agg(jsonb_build_object('value', category_slug, 'label', category_name, 'count', n) ORDER BY n DESC), '[]') FROM (SELECT category_slug, max(category_name) AS category_name, count(*) n FROM travelshop_tours WHERE is_active AND category_slug IS NOT NULL GROUP BY category_slug) c),
    'countries', (SELECT coalesce(jsonb_agg(jsonb_build_object('value', country, 'count', n) ORDER BY n DESC), '[]') FROM (SELECT country, count(*) n FROM travelshop_tours WHERE is_active AND country IS NOT NULL GROUP BY country) c),
    'destinations', (SELECT coalesce(jsonb_agg(jsonb_build_object('value', d, 'count', n) ORDER BY n DESC), '[]') FROM (SELECT d, count(*) n FROM travelshop_tours, unnest(destinations) d WHERE is_active GROUP BY d ORDER BY n DESC LIMIT 200) c),
    'activities', (SELECT coalesce(jsonb_agg(jsonb_build_object('value', a, 'count', n) ORDER BY n DESC), '[]') FROM (SELECT a, count(*) n FROM travelshop_tours, unnest(activities) a WHERE is_active GROUP BY a ORDER BY n DESC LIMIT 100) c),
    'languages', (SELECT coalesce(jsonb_agg(jsonb_build_object('value', l, 'count', n) ORDER BY n DESC), '[]') FROM (SELECT l, count(*) n FROM travelshop_tours, unnest(languages) l WHERE is_active GROUP BY l) c)
  )
$$;
REVOKE ALL ON FUNCTION public.travelshop_facets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travelshop_facets() TO service_role;