CREATE OR REPLACE FUNCTION public.travelshop_explore()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'hierarchy', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('region', region, 'count', rc, 'countries', countries) ORDER BY rc DESC), '[]')
      FROM (
        SELECT r.region, sum(c.cc) rc,
          jsonb_agg(jsonb_build_object('country', c.country, 'count', c.cc, 'cities', c.cities) ORDER BY c.cc DESC) countries
        FROM (SELECT DISTINCT coalesce(region,'Other') region FROM travelshop_tours WHERE is_active) r
        JOIN LATERAL (
          SELECT country, count(*) cc,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('city', city, 'count', n) ORDER BY n DESC), '[]') FROM (
               SELECT start_location city, count(*) n FROM travelshop_tours t2
               WHERE t2.is_active AND coalesce(t2.region,'Other') = r.region AND t2.country = t.country AND t2.start_location IS NOT NULL
               GROUP BY start_location ORDER BY n DESC LIMIT 40) x) cities
          FROM travelshop_tours t WHERE t.is_active AND coalesce(t.region,'Other') = r.region AND t.country IS NOT NULL
          GROUP BY country
        ) c ON true
        GROUP BY r.region
      ) h
    ),
    'trending', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('value', d, 'count', n, 'reviews', rv) ORDER BY rv DESC), '[]') FROM (
        SELECT d, count(*) n, sum(coalesce(review_count,0)) rv FROM travelshop_tours, unnest(destinations) d
        WHERE is_active GROUP BY d HAVING count(*) >= 5 ORDER BY rv DESC LIMIT 12) t
    )
  )
$function$;
REVOKE ALL ON FUNCTION public.travelshop_explore() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travelshop_explore() TO service_role;