// TripJack UAT certification — server-only helpers.
//
// * Connectivity check: read-only probes per suite, classified honestly. A Cabs
//   HTTP 404 / HTML response is reported as SUPPLIER-SIDE BLOCKED (product not
//   enabled on the key or egress IP not whitelisted) — never bypassed.
// * Evidence export: one JSON file per request and per response, straight from
//   the persisted evidence rows. Credentials are never stored, so the export
//   only strips credential-shaped keys defensively; payload data (including
//   real passenger names, which TripJack requires) is left intact.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { tripjackCall, tripjackCredentialStatus } from "./client.server";
import {
  TRIPJACK_CERTIFICATION_CASES,
  TRIPJACK_UAT_BASE_URL,
  type TripjackCertificationStatus,
  type TripjackSuite,
} from "./config";

type Client = SupabaseClient<Database>;
type LogRow = Database["public"]["Tables"]["tripjack_api_logs"]["Row"];
type CaseRow = Database["public"]["Tables"]["tripjack_certification_cases"]["Row"];

export type SuiteConnectivity = {
  suite: TripjackSuite;
  state: "LIVE" | "SUPPLIER-SIDE BLOCKED" | "NOT CONFIGURED" | "ERROR";
  httpStatus: number | null;
  detail: string;
  correlationId?: string;
  checkedAt: string;
};

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Read-only probes only — never touches a mutating capability. */
export async function checkTripjackConnectivity(): Promise<SuiteConnectivity[]> {
  const checkedAt = new Date().toISOString();
  if (!tripjackCredentialStatus().configured) {
    return (["cabs", "tripsafe"] as TripjackSuite[]).map((suite) => ({
      suite,
      state: "NOT CONFIGURED",
      httpStatus: null,
      detail: "TRIPJACK_UAT_API_KEY is not configured on the server.",
      checkedAt,
    }));
  }

  const cabs = await tripjackCall<unknown>("cabs", "location-search", { input: "igi" });
  const cabsResult: SuiteConnectivity = cabs.ok
    ? { suite: "cabs", state: "LIVE", httpStatus: 200, detail: "Location Search responded with JSON.", correlationId: cabs.correlationId, checkedAt }
    : cabs.error.kind === "invalid-response" || cabs.error.status === 404 || cabs.error.status === 403
      ? {
          suite: "cabs",
          state: "SUPPLIER-SIDE BLOCKED",
          httpStatus: cabs.error.status ?? null,
          detail:
            "Cabs UAT endpoint is not reachable with this key (HTTP 404 / non-JSON). TripJack must enable the Cabs product on the API key and whitelist the server egress IP. Not bypassed.",
          correlationId: cabs.correlationId,
          checkedAt,
        }
      : { suite: "cabs", state: "ERROR", httpStatus: cabs.error.status ?? null, detail: cabs.error.message, correlationId: cabs.correlationId, checkedAt };

  const tripsafe = await tripjackCall<{ isr?: { iinfo?: { pli?: unknown[] } } }>("tripsafe", "search", {
    isq: {
      sd: futureDate(10),
      ed: futureDate(17),
      isc: { iri: [{ rkey: "SCH", rt: "POPULARREGION" }] },
      iti: [{ age: 30 }],
    },
  });
  const tripsafeResult: SuiteConnectivity = tripsafe.ok
    ? {
        suite: "tripsafe",
        state: "LIVE",
        httpStatus: 200,
        detail: `Search responded with ${tripsafe.data?.isr?.iinfo?.pli?.length ?? 0} plan group(s).`,
        correlationId: tripsafe.correlationId,
        checkedAt,
      }
    : tripsafe.error.kind === "invalid-response" || tripsafe.error.status === 404 || tripsafe.error.status === 403
      ? {
          suite: "tripsafe",
          state: "SUPPLIER-SIDE BLOCKED",
          httpStatus: tripsafe.error.status ?? null,
          detail: "TripSafe UAT endpoint rejected the key or egress IP. TripJack must enable the product / whitelist the IP.",
          correlationId: tripsafe.correlationId,
          checkedAt,
        }
      : { suite: "tripsafe", state: "ERROR", httpStatus: tripsafe.error.status ?? null, detail: tripsafe.error.message, correlationId: tripsafe.correlationId, checkedAt };

  return [cabsResult, tripsafeResult];
}

export type CertificationCaseView = {
  key: string;
  suite: TripjackSuite;
  section: string;
  title: string;
  optional: boolean;
  capabilities: string[];
  status: TripjackCertificationStatus;
  worldwayBookingId?: string;
  supplierBookingId?: string;
  confirmationNumbers: string[];
  correlationIds: string[];
  notes?: string;
  evidenceCount: number;
  updatedAt?: string;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Checklist merged with persisted status + evidence counts (RLS: staff only). */
export async function loadCertificationOverview(client: Client) {
  const [{ data: rows }, { data: recent }, { count }] = await Promise.all([
    client.from("tripjack_certification_cases").select("*"),
    client.from("tripjack_api_logs").select("id, correlation_id, suite, capability, method, path, response_status, outcome, error_kind, duration_ms, supplier_booking_id, created_at").order("created_at", { ascending: false }).limit(60),
    client.from("tripjack_api_logs").select("id", { count: "exact", head: true }),
  ]);
  const byKey = new Map<string, CaseRow>((rows ?? []).map((r) => [r.case_key, r]));

  const cases: CertificationCaseView[] = [];
  for (const c of TRIPJACK_CERTIFICATION_CASES) {
    const row = byKey.get(c.key);
    // Only plain identifier characters may reach the PostgREST filter syntax.
    const SAFE_ID = /^[A-Za-z0-9_\-:.]{1,120}$/;
    const rawBookingId = row?.supplier_booking_id ?? undefined;
    const supplierBookingId = rawBookingId && SAFE_ID.test(rawBookingId) ? rawBookingId : undefined;
    const correlationIds = asStringArray(row?.correlation_ids).filter((id) => SAFE_ID.test(id));
    let evidenceCount = 0;
    if (supplierBookingId || correlationIds.length) {
      const q = client.from("tripjack_api_logs").select("id", { count: "exact", head: true });
      const filters: string[] = [];
      if (supplierBookingId) filters.push(`supplier_booking_id.eq.${supplierBookingId}`);
      if (correlationIds.length) filters.push(`correlation_id.in.(${correlationIds.join(",")})`);
      const { count: n } = await q.or(filters.join(","));
      evidenceCount = n ?? 0;
    }
    cases.push({
      key: c.key,
      suite: c.suite,
      section: c.section,
      title: c.title,
      optional: Boolean(c.optional),
      capabilities: c.capabilities,
      status: (row?.status as TripjackCertificationStatus | undefined) ?? "not_started",
      worldwayBookingId: row?.worldway_booking_id ?? undefined,
      supplierBookingId,
      confirmationNumbers: asStringArray(row?.confirmation_numbers),
      correlationIds,
      notes: row?.notes ?? undefined,
      evidenceCount,
      updatedAt: row?.updated_at ?? undefined,
    });
  }

  return {
    environment: "uat" as const,
    baseUrl: TRIPJACK_UAT_BASE_URL,
    credentialConfigured: tripjackCredentialStatus().configured,
    cases,
    totals: {
      cases: cases.length,
      passed: cases.filter((c) => c.status === "passed").length,
      blocked: cases.filter((c) => c.status === "blocked").length,
      evidenceRows: count ?? 0,
    },
    recentLogs: (recent ?? []).map((l) => ({
      id: l.id,
      correlationId: l.correlation_id,
      suite: l.suite,
      capability: l.capability,
      method: l.method,
      path: l.path,
      status: l.response_status,
      outcome: l.outcome,
      errorKind: l.error_kind,
      durationMs: l.duration_ms,
      supplierBookingId: l.supplier_booking_id,
      at: l.created_at,
    })),
  };
}

export async function upsertCertificationCase(
  client: Client,
  userId: string,
  input: {
    caseKey: string;
    status: TripjackCertificationStatus;
    worldwayBookingId?: string | null;
    supplierBookingId?: string | null;
    confirmationNumbers?: string[];
    correlationIds?: string[];
    notes?: string | null;
  },
) {
  const def = TRIPJACK_CERTIFICATION_CASES.find((c) => c.key === input.caseKey);
  if (!def) throw new Error("Unknown certification case.");
  const { error } = await client.from("tripjack_certification_cases").upsert(
    {
      case_key: def.key,
      suite: def.suite,
      status: input.status,
      worldway_booking_id: input.worldwayBookingId ?? null,
      supplier_booking_id: input.supplierBookingId?.trim() || null,
      confirmation_numbers: input.confirmationNumbers ?? [],
      correlation_ids: input.correlationIds ?? [],
      notes: input.notes ?? null,
      updated_by: userId,
    },
    { onConflict: "case_key" },
  );
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const CREDENTIAL_KEYS = new Set(["apikey", "api_key", "authorization", "x-api-key", "secret", "password"]);

/** Defensive credential strip only — payload data is otherwise unmodified. */
export function stripCredentials(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (Array.isArray(value)) return value.map((v) => stripCredentials(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = CREDENTIAL_KEYS.has(k.toLowerCase()) ? "[removed]" : stripCredentials(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type EvidenceFile = { name: string; content: string };

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function toFiles(rows: LogRow[], folder: string): EvidenceFile[] {
  const files: EvidenceFile[] = [];
  rows.forEach((row, i) => {
    const n = String(i + 1).padStart(2, "0");
    const base = `${folder}/${n}_${safe(row.suite)}_${safe(row.capability)}`;
    const url = `${TRIPJACK_UAT_BASE_URL}${row.path}${
      row.request_query && typeof row.request_query === "object" && Object.keys(row.request_query as object).length
        ? `?${new URLSearchParams(row.request_query as Record<string, string>).toString()}`
        : ""
    }`;
    files.push({
      name: `${base}_request.json`,
      content: JSON.stringify(
        {
          correlationId: row.correlation_id,
          timestamp: row.created_at,
          method: row.method,
          url,
          headers: { "Content-Type": "application/json", apikey: "[attached separately per TripJack certification instructions]" },
          body: stripCredentials(row.request_body) ?? null,
        },
        null,
        2,
      ),
    });
    files.push({
      name: `${base}_response.json`,
      content: JSON.stringify(
        {
          correlationId: row.correlation_id,
          timestamp: row.created_at,
          httpStatus: row.response_status,
          durationMs: row.duration_ms,
          outcome: row.outcome,
          body: stripCredentials(row.response_body) ?? null,
        },
        null,
        2,
      ),
    });
  });
  return files;
}

/**
 * Evidence bundle for a certification case: every persisted call matching the
 * case's supplier booking id and/or recorded correlation ids, plus a manifest.
 */
export async function exportCaseEvidence(client: Client, caseKey: string): Promise<{ files: EvidenceFile[]; count: number }> {
  const def = TRIPJACK_CERTIFICATION_CASES.find((c) => c.key === caseKey);
  if (!def) throw new Error("Unknown certification case.");
  const { data: row } = await client.from("tripjack_certification_cases").select("*").eq("case_key", caseKey).maybeSingle();
  const supplierBookingId = row?.supplier_booking_id ?? null;
  const correlationIds = asStringArray(row?.correlation_ids);
  if (!supplierBookingId && !correlationIds.length) return { files: [], count: 0 };

  // Parameterised queries only — stored values never become filter syntax.
  const byId = new Map<string, LogRow>();
  if (supplierBookingId) {
    const { data, error } = await client
      .from("tripjack_api_logs")
      .select("*")
      .eq("supplier_booking_id", supplierBookingId)
      .limit(200);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as LogRow[]) byId.set((r as { id: string }).id, r);
  }
  if (correlationIds.length) {
    const { data, error } = await client
      .from("tripjack_api_logs")
      .select("*")
      .in("correlation_id", correlationIds)
      .limit(200);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as LogRow[]) byId.set((r as { id: string }).id, r);
  }
  const rows = [...byId.values()]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, 200);
  const folder = safe(caseKey);
  const files = toFiles(rows, folder);
  files.unshift({
    name: `${folder}/manifest.json`,
    content: JSON.stringify(
      {
        case: def,
        status: row?.status ?? "not_started",
        supplierBookingId,
        confirmationNumbers: asStringArray(row?.confirmation_numbers),
        correlationIds,
        environment: "uat",
        baseUrl: TRIPJACK_UAT_BASE_URL,
        calls: rows.map((r) => ({ correlationId: r.correlation_id, capability: r.capability, status: r.response_status, at: r.created_at })),
        note: "Logs are unmodified supplier request/response JSON; credentials are never stored. Attach the API key separately when submitting.",
      },
      null,
      2,
    ),
  });
  return { files, count: rows.length };
}

/** Evidence for an arbitrary set of correlation ids (e.g. from a booking's timeline). */
export async function exportCorrelationEvidence(client: Client, correlationIds: string[]): Promise<{ files: EvidenceFile[]; count: number }> {
  if (!correlationIds.length) return { files: [], count: 0 };
  const { data: logs, error } = await client
    .from("tripjack_api_logs")
    .select("*")
    .in("correlation_id", correlationIds)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = logs ?? [];
  return { files: toFiles(rows, "evidence"), count: rows.length };
}

// ─── Full certification package (all real evidence, step-wise) ───────────────

export const TRIPJACK_EVIDENCE_STEPS = [
  { id: "TS-SEARCH", suite: "tripsafe", step: "Search", capabilities: ["search", "student", "amt"] },
  { id: "TS-REVIEW", suite: "tripsafe", step: "Review", capabilities: ["review"] },
  { id: "TS-BOOK", suite: "tripsafe", step: "Book", capabilities: ["book", "booking-details"] },
  { id: "CAB-LOCSEARCH", suite: "cabs", step: "Location Search", capabilities: ["location-search"] },
  { id: "CAB-LATLONG", suite: "cabs", step: "Get Latitude/Longitude", capabilities: ["location-latlong"] },
  { id: "CAB-QUOTES", suite: "cabs", step: "Quotes", capabilities: ["quote"] },
  { id: "CAB-REVIEW", suite: "cabs", step: "Review", capabilities: ["book"] },
  { id: "CAB-PAY", suite: "cabs", step: "Pay", capabilities: ["payment", "booking-details"] },
] as const;

export type EvidenceStatus = "PASS" | "BLOCKED" | "FAILED" | "EVIDENCE_MISSING";

function evidenceStatus(rows: LogRow[]): EvidenceStatus {
  if (!rows.length) return "EVIDENCE_MISSING";
  if (rows.some((r) => r.outcome === "ok" && r.response_status !== null && r.response_status >= 200 && r.response_status < 300)) return "PASS";
  if (rows.some((r) => r.error_kind === "invalid-response" || [403, 404, 503].includes(r.response_status ?? 0))) return "BLOCKED";
  return "FAILED";
}

export type PackageRow = {
  stepId: string; suite: string; step: string; status: EvidenceStatus; adminCases: string;
  correlationId: string; timestamp: string; endpoint: string; httpStatus: number | null; durationMs: number | null;
  outcome: string; reference: string; requestFile: string; responseFile: string;
};

/** Every persisted real call, grouped per certification step. Nothing is synthesised. */
export async function exportCertificationPackage(client: Client) {
  const { data, error } = await client.from("tripjack_api_logs").select("*").order("created_at", { ascending: true }).limit(1000);
  if (error) throw new Error(error.message);
  const logs = (data ?? []) as LogRow[];
  const { data: caseRows } = await client.from("tripjack_certification_cases").select("*");
  const files: EvidenceFile[] = [];
  const rows: PackageRow[] = [];
  const steps: Record<string, unknown>[] = [];
  let n = 0;
  for (const s of TRIPJACK_EVIDENCE_STEPS) {
    const mine = logs.filter((l) => l.suite === s.suite && (s.capabilities as readonly string[]).includes(l.capability));
    const status = evidenceStatus(mine);
    const adminCases = TRIPJACK_CERTIFICATION_CASES.filter((c) => c.suite === s.suite && c.capabilities.some((k) => (s.capabilities as readonly string[]).includes(k))).map((c) => c.key);
    const lines = [`CASE ${s.id} — ${s.suite.toUpperCase()} ${s.step}`, `Admin cases: ${adminCases.join(", ")}`, `Evidence status: ${status}`, ""];
    const calls: Record<string, unknown>[] = [];
    for (const r of mine) {
      n++;
      const tag = `${String(n).padStart(3, "0")}_${s.id}_${safe(r.correlation_id)}`;
      const endpoint = `${TRIPJACK_UAT_BASE_URL}${r.path}`;
      const reqFile = `requests/request_${tag}.json`;
      const resFile = `responses/response_${tag}.json`;
      files.push({ name: reqFile, content: JSON.stringify({ caseId: s.id, correlationId: r.correlation_id, timestamp: r.created_at, method: r.method, url: endpoint, query: r.request_query, headers: { "Content-Type": "application/json", apikey: "[removed — never stored]" }, body: stripCredentials(r.request_body) ?? null }, null, 2) });
      files.push({ name: resFile, content: JSON.stringify({ caseId: s.id, correlationId: r.correlation_id, timestamp: r.created_at, httpStatus: r.response_status, durationMs: r.duration_ms, outcome: r.outcome, errorKind: r.error_kind, body: stripCredentials(r.response_body) ?? null }, null, 2) });
      const ref = r.supplier_booking_id ?? "";
      lines.push(`[${r.created_at}] ${r.method} ${endpoint} cid=${r.correlation_id} http=${r.response_status ?? "-"} ${r.duration_ms}ms outcome=${r.outcome}${r.error_kind ? ` (${r.error_kind})` : ""}${ref ? ` ref=${ref}` : ""} log=${r.id}`);
      calls.push({ correlationId: r.correlation_id, capability: r.capability, timestamp: r.created_at, endpoint, httpStatus: r.response_status, durationMs: r.duration_ms, outcome: r.outcome, errorKind: r.error_kind, reference: ref || null, requestFile: reqFile, responseFile: resFile, logId: r.id });
      rows.push({ stepId: s.id, suite: s.suite, step: s.step, status, adminCases: adminCases.join(", "), correlationId: r.correlation_id, timestamp: r.created_at, endpoint, httpStatus: r.response_status, durationMs: r.duration_ms, outcome: r.outcome, reference: ref, requestFile: reqFile, responseFile: resFile });
    }
    if (!mine.length) {
      lines.push("No real request/response recorded. Nothing reconstructed.", `Must capture: a real UAT ${s.step} call (${s.capabilities.join(" / ")}).`);
      rows.push({ stepId: s.id, suite: s.suite, step: s.step, status, adminCases: adminCases.join(", "), correlationId: "", timestamp: "", endpoint: "", httpStatus: null, durationMs: null, outcome: "", reference: "", requestFile: "", responseFile: "" });
    }
    files.push({ name: `case_logs/${s.id}.log`, content: lines.join("\n") + "\n" });
    steps.push({ caseId: s.id, suite: s.suite, step: s.step, status, adminCases, calls });
  }
  const generatedAt = new Date().toISOString();
  files.unshift({ name: "TripJack_Certification_Evidence.json", content: JSON.stringify({ environment: "uat", baseUrl: TRIPJACK_UAT_BASE_URL, generatedAt, evidenceRows: logs.length, cases: steps, adminCaseRecords: (caseRows ?? []).map((c) => ({ caseKey: c.case_key, status: c.status, supplierBookingId: c.supplier_booking_id, confirmationNumbers: c.confirmation_numbers, correlationIds: c.correlation_ids, updatedAt: c.updated_at })) }, null, 2) });
  files.push({ name: "EVIDENCE_INDEX.md", content: ["# Evidence Index", "", "| Case | Status | Correlation ID | Timestamp | HTTP | Ref | Request | Response |", "|---|---|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.stepId} | ${r.status} | ${r.correlationId || "—"} | ${r.timestamp || "—"} | ${r.httpStatus ?? "—"} | ${r.reference || "—"} | ${r.requestFile || "—"} | ${r.responseFile || "—"} |`)].join("\n") + "\n" });
  const pass = steps.filter((s) => s.status === "PASS").length;
  files.push({ name: "FINAL_AUDIT_REPORT.md", content: [`# TripJack UAT Certification — Audit Report`, `Generated ${generatedAt} · UAT ${TRIPJACK_UAT_BASE_URL}`, "", `Real evidence rows: ${logs.length}. Steps with real passing evidence: ${pass}/${steps.length}.`, `Overall: ${pass === steps.length ? "ALL STEPS EVIDENCED" : "NOT READY — see missing/blocked steps"}`, "", ...steps.map((s) => `- ${s.caseId} (${s.suite} ${s.step}): ${s.status}`), "", "All payloads are unmodified supplier JSON from tripjack_api_logs. Credentials are never stored; the API key must be attached separately."].join("\n") + "\n" });
  return { files, rows, count: logs.length };
}
