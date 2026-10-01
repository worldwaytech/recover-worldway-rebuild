CREATE OR REPLACE FUNCTION private.run_intel_recheck()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_temp'
AS $$
DECLARE cfg private.integration_schedule_config;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.intel_decisions WHERE journey_id IS NOT NULL AND jsonb_array_length(recheck_due) > 0 AND created_at > now() - interval '7 days') THEN RETURN; END IF;
  SELECT * INTO cfg FROM private.integration_schedule_config WHERE id;
  IF cfg IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://project--1efb52bc-177b-40a1-a064-649c8874fa6d.lovable.app/api/public/hooks/intel-recheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-integration-sync-secret', cfg.token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION private.run_intel_recheck() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('intel-hourly-recheck', '17 * * * *', 'SELECT private.run_intel_recheck();');