// Universal API Management & Product Sync Center — client-safe types.
//
// One provider-agnostic engine drives every supplier. A supplier is a row in
// `integration_providers`; adding one is configuration, never code.

export type IntegrationAuthKind =
  | "api-key-header"
  | "bearer-token"
  | "basic"
  | "header-pair"
  | "oauth2-client-credentials"
  | "signed-session"
  | "none";

export type IntegrationSyncStrategy = "full" | "cursor" | "updated-since" | "index";

/**
 * Supplier payloads and audit details cross the server boundary, so they are
 * modelled as explicit JSON — never as `unknown`, which cannot be serialized.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type IntegrationConnectionState =
  | "connected"
  | "not-connected"
  | "credentials-missing"
  | "error"
  | "unknown";

export type IntegrationSyncScope = "full" | "incremental" | "product";
export type IntegrationSyncTrigger = "manual" | "auto" | "webhook";
export type IntegrationConflictPolicy = "supplier-wins" | "local-wins" | "manual-review";

export interface IntegrationPagination {
  mode?: "none" | "page" | "offset" | "cursor";
  pageParam?: string;
  sizeParam?: string;
  size?: number;
  maxPages?: number;
  cursorParam?: string;
  cursorPath?: string;
}

export interface IntegrationProvider {
  id: string;
  providerKey: string;
  name: string;
  category: string;
  summary: string;
  baseUrl: string;
  authKind: IntegrationAuthKind;
  authHeader: string | null;
  tokenPath: string | null;
  scope: string | null;
  secretNames: string[];
  endpoints: Record<string, string>;
  capabilities: string[];
  collections: string[];
  rateLimitPerSecond: number;
  cacheTtlSeconds: number;
  maxRetries: number;
  timeoutMs: number;
  syncStrategy: IntegrationSyncStrategy;
  pagination: IntegrationPagination;
  fieldMap: Record<string, string>;
  dedupeKeys: string[];
  conflictPolicy: IntegrationConflictPolicy;
  recordPath: string | null;
  enabled: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  webhookSecretName: string | null;
  docsUrl: string | null;
  contractStatus: string;
  /** Internal adapter id when a verified supplier client already exists. */
  adapter: string | null;
  origin: "registry" | "custom";
  connectionState: IntegrationConnectionState;
  connectionCheckedAt: string | null;
  connectionDetail: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  notes: string | null;
  /** Derived, never persisted: which required secrets are absent. */
  missingSecrets: string[];
  credentialsConfigured: boolean;
  productCount: number;
  webhookPath: string;
}

export interface IntegrationSettings {
  globalEnabled: boolean;
  globalAutoSync: boolean;
  maintenancePaused: boolean;
  updatedAt: string;
}

export interface IntegrationProductRow {
  id: string;
  providerKey: string;
  providerName: string;
  externalId: string;
  productType: string;
  slug: string | null;
  title: string;
  sourceTable: string | null;
  detailPath: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  priceFrom: number | null;
  currency: string | null;
  availabilityState: string | null;
  conflictState: string;
  lastError: string | null;
}

export interface IntegrationRunRow {
  id: string;
  providerKey: string;
  scope: string;
  trigger: string;
  status: string;
  externalId: string | null;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface IntegrationLogRow {
  id: string;
  providerKey: string;
  level: string;
  operation: string;
  status: string;
  httpStatus: number | null;
  latencyMs: number | null;
  attempts: number | null;
  message: string | null;
  createdAt: string;
}

export interface IntegrationAuditRow {
  id: string;
  actorEmail: string | null;
  action: string;
  providerKey: string | null;
  detail: JsonRecord;
  createdAt: string;
}

export interface IntegrationTestResult {
  providerKey: string;
  state: IntegrationConnectionState;
  httpStatus: number | null;
  latencyMs: number | null;
  attempts: number;
  detail: string;
  checkedAt: string;
}

export interface IntegrationSyncOutcome {
  providerKey: string;
  runId: string | null;
  scope: IntegrationSyncScope;
  status: "success" | "partial" | "failed" | "skipped";
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  durationMs: number;
  message: string;
}
