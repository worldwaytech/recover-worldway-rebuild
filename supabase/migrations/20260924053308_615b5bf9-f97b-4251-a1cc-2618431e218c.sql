CREATE OR REPLACE FUNCTION private.run_bokun_marketplace_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'private', 'public', 'extensions', 'pg_temp'
AS $$
DECLARE cfg private.integration_schedule_config;
BEGIN
  SELECT * INTO cfg FROM private.integration_schedule_config WHERE id;
  IF cfg IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := replace(cfg.endpoint, '/api/public/hooks/integration-sync', '/api/public/hooks/bokun-marketplace-sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-integration-sync-secret', cfg.token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION private.run_bokun_marketplace_sync() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('bokun-marketplace-sync', '40 * * * *', 'SELECT private.run_bokun_marketplace_sync();');