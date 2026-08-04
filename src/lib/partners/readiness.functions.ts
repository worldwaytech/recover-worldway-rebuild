import { createServerFn } from "@tanstack/react-start";
import type { PartnerReadiness } from "./types";

/**
 * Public, non-sensitive connector readiness summary for the executive console.
 * Never returns secret values — only whether each required credential is present.
 */
export const getPartnerReadiness = createServerFn({ method: "GET" }).handler(
  async (): Promise<PartnerReadiness> => {
    const { PARTNER_CONNECTORS } = await import("./registry");
    const { missingSecrets, resolveMode } = await import("./runtime.server");
    const { VERTICAL_TEMPLATES, templateForKind } = await import("./templates");
    const { ALL_DEMO_JOURNEYS } = await import("./demo-journeys-verticals");
    return {
      generatedAt: new Date().toISOString(),
      partners: PARTNER_CONNECTORS.map((cfg) => {
        const missing = missingSecrets(cfg);
        return {
          id: cfg.id,
          name: cfg.name,
          category: cfg.category,
          summary: cfg.summary,
          contractStatus: cfg.contractStatus,
          authKind: cfg.auth.kind,
          capabilities: cfg.capabilities,
          collections: cfg.collections,
          mode: resolveMode(cfg),
          credentialsRequired: cfg.auth.secrets.length,
          credentialsConfigured: cfg.auth.secrets.length - missing.length,
          awaiting: missing.length > 0,
          templates: cfg.templates ?? [],
          feed: cfg.feed
            ? {
                format: cfg.feed.format,
                recordPath: cfg.feed.recordPath,
                mappedFields: Object.keys(cfg.feed.fieldMap).length,
                push: Boolean(cfg.feed.webhookSecret),
              }
            : null,
        };
      }),
      templateCoverage: VERTICAL_TEMPLATES.map((t) => {
        const matches = ALL_DEMO_JOURNEYS.filter(
          (j) => (j.templateId ?? templateForKind(j.collectionKind).id) === t.id,
        );
        return {
          id: t.id,
          label: t.label,
          routeBase: t.routeBase,
          sections: t.sections.length,
          sampleJourneys: matches.length,
          suppliers: Array.from(new Set(matches.map((j) => j.partnerName))),
        };
      }),
    };
  },
);
