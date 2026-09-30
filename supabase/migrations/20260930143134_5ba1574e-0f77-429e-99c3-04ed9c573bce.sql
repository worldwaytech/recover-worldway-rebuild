-- lovable-cron-fallback-reviewed: resumable daily catalogue sync needs ~17 consecutive 25s steps; confined to a 2h nightly window (40 runs/day), each step no-ops once the day's run is complete.
CREATE OR REPLACE FUNCTION private.run_tour_catalogue_sync()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_temp'
AS $$
DECLARE cfg private.integration_schedule_config;
BEGIN
  SELECT * INTO cfg FROM private.integration_schedule_config WHERE id;
  IF cfg IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://project--1efb52bc-177b-40a1-a064-649c8874fa6d-dev.lovable.app/api/public/hooks/tour-catalogue-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-integration-sync-secret', cfg.token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION private.run_tour_catalogue_sync() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('tour-catalogue-daily-sync', '*/3 2-3 * * *', 'SELECT private.run_tour_catalogue_sync();');