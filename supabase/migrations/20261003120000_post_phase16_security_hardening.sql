-- Post-Phase-16 master-audit hardening.
-- Phase 16 graph/intelligence/network tables are server-side commerce
-- intelligence state. They are not direct client data surfaces.
--
-- Keep access through trusted server functions using service_role. RLS remains
-- enabled as a second boundary so an authenticated/anonymous client cannot
-- read or mutate graph, intelligence, or network-request state directly.

REVOKE ALL ON public.worldway_travel_graph_nodes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.worldway_travel_graph_edges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.worldway_travel_intelligence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.worldway_commerce_network_requests FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.worldway_travel_graph_nodes TO service_role;
GRANT ALL ON public.worldway_travel_graph_edges TO service_role;
GRANT ALL ON public.worldway_travel_intelligence TO service_role;
GRANT ALL ON public.worldway_commerce_network_requests TO service_role;

COMMENT ON TABLE public.worldway_travel_graph_nodes IS
  'Phase 16 canonical travel graph state. Server-side/service-role access only; tenant_id isolates private graph state.';

COMMENT ON TABLE public.worldway_travel_graph_edges IS
  'Phase 16 evidence-backed graph relationships. Server-side/service-role access only.';

COMMENT ON TABLE public.worldway_travel_intelligence IS
  'Phase 16 normalized intelligence observations. Server-side/service-role access only; evidence is mandatory at the application layer.';

COMMENT ON TABLE public.worldway_commerce_network_requests IS
  'Phase 16 governed commerce-network requests and decisions. Server-side/service-role access only.';
