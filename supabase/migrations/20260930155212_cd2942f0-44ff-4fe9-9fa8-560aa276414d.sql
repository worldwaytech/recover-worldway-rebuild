REVOKE EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) TO authenticated, service_role;
REVOKE SELECT ON public.partner_api_keys FROM authenticated;
GRANT SELECT (id, tenant_id, label, key_prefix, scopes, expires_at, revoked_at, last_used_at, created_by, created_at) ON public.partner_api_keys TO authenticated;