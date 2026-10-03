-- Phase 12: Partner API product entitlements.
-- One Worldway API platform supports single-product, multi-product and
-- full-catalogue credentials without duplicating the Commerce gateway.

ALTER TABLE public.partner_api_keys
  ADD COLUMN IF NOT EXISTS api_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS api_access_mode text NOT NULL DEFAULT 'multi_product'
    CHECK (api_access_mode IN ('single_product','multi_product','full_catalogue'));

ALTER TABLE public.partner_api_keys
  DROP CONSTRAINT IF EXISTS partner_api_keys_product_mode_check;

ALTER TABLE public.partner_api_keys
  ADD CONSTRAINT partner_api_keys_product_mode_check CHECK (
    (api_access_mode = 'single_product' AND cardinality(api_products) = 1)
    OR (api_access_mode = 'multi_product' AND cardinality(api_products) >= 2)
    OR (api_access_mode = 'full_catalogue' AND cardinality(api_products) = 9)
    OR cardinality(api_products) = 0
  );

CREATE INDEX IF NOT EXISTS partner_api_keys_products_idx
  ON public.partner_api_keys USING GIN (api_products);

COMMENT ON COLUMN public.partner_api_keys.api_products IS
  'Worldway product entitlements for this credential: flights, hotels, transfers, activities, tours, cruises, rail, private_aviation, concierge.';

COMMENT ON COLUMN public.partner_api_keys.api_access_mode IS
  'single_product, multi_product, or full_catalogue API entitlement mode.';

-- Product entitlement changes remain service-role controlled through the
-- existing partner administration functions. Plaintext API keys are never stored.
