import { createFileRoute } from '@tanstack/react-router';

const SUPER_ADMIN_ID = '410cbc65-f02f-49f6-bf56-8b5da1e4b807';

// One-shot, super-admin-only endpoint: registers the dedicated confidential
// OAuth client for Microsoft Foundry identity passthrough against /mcp.
export const Route = createFileRoute('/api/admin/foundry-oauth-client')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get('authorization') ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !userData.user || userData.user.id !== SUPER_ADMIN_ID) {
          return Response.json({ error: 'forbidden' }, { status: 403 });
        }

        const admin = supabaseAdmin.auth.admin as unknown as {
          oauth: {
            listClients: () => Promise<{ data: { clients?: Array<{ client_id: string; client_name?: string }> } | null; error: unknown }>;
            createClient: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
          };
        };

        // Idempotent: reuse the existing Foundry client if already registered.
        const existing = await admin.oauth.listClients();
        const found = existing.data?.clients?.find((c) => c.client_name === 'Microsoft Foundry');
        if (found) {
          return Response.json({
            status: 'already_exists',
            client_id: found.client_id,
            client_name: found.client_name,
          });
        }

        const { data, error } = await admin.oauth.createClient({
          client_name: 'Microsoft Foundry',
          client_type: 'confidential',
          grant_types: ['authorization_code', 'refresh_token'],
          scope: 'openid email profile offline_access',
          // Placeholder — replaced with the exact Foundry redirect URI once
          // Microsoft Foundry shows it during Custom OAuth configuration.
          redirect_uris: ['https://worldwaytravelsgroup.com/.lovable/oauth/foundry-callback-pending'],
        });
        if (error || !data) {
          return Response.json({ error: error?.message ?? 'create_failed' }, { status: 500 });
        }

        return Response.json({
          status: 'created',
          client_id: data.client_id,
          client_name: data.client_name,
          client_type: data.client_type,
          grant_types: data.grant_types,
          scope: data.scope,
          redirect_uris: data.redirect_uris,
          client_secret: data.client_secret ?? null,
        });
      },
    },
  },
});
