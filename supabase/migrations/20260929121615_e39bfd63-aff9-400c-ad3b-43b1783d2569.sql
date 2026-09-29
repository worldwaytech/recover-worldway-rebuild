ALTER TABLE public.journey_versions
  ADD COLUMN explanation text,
  ADD COLUMN readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN on_request jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN sources jsonb NOT NULL DEFAULT '[]'::jsonb;