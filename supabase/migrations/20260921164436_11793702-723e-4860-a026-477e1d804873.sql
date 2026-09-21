CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.integration_schedule_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  endpoint text NOT NULL,
  token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.integration_schedule_config (id, endpoint, token)
VALUES (
  true,
  'https://project--1efb52bc-177b-40a1-a064-649c8874fa6d.lovable.app/api/public/hooks/integration-sync',
  '89545d5acee5bb60504a2a63c33740cc79815de0235e5395'
)
ON CONFLICT (id) DO UPDATE
SET endpoint = EXCLUDED.endpoint, token = EXCLUDED.token, updated_at = now();

REVOKE ALL ON private.integration_schedule_config FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.run_integration_auto_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions, pg_temp
AS $$
DECLARE
  cfg private.integration_schedule_config;
BEGIN
  SELECT * INTO cfg FROM private.integration_schedule_config WHERE id;
  IF cfg IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integration-sync-secret', cfg.token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.run_integration_auto_sync() FROM PUBLIC;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'integration-auto-sync';

SELECT cron.schedule(
  'integration-auto-sync',
  '20 * * * *',
  $$SELECT private.run_integration_auto_sync();$$
);