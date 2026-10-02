import { createHash } from "node:crypto";
import { z } from "zod";

const DocumentInput = z.object({
  sourceType: z.enum(["official", "supplier", "worldway", "web", "document", "regulatory"]),
  canonicalUrl: z.string().url().max(2000).optional(),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(2_000_000),
  language: z.string().trim().min(2).max(16).default("en"),
  trustTier: z.number().int().min(1).max(5).default(3),
  status: z.enum(["active", "published", "stale", "archived"]).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type KnowledgeDocumentInput = z.input<typeof DocumentInput>;

export interface KnowledgeHit {
  chunkId: string;
  documentId: string;
  title: string;
  sourceType: string;
  canonicalUrl: string | null;
  trustTier: number;
  content: string;
  observedAt: string;
  validUntil: string | null;
  confidence: number;
  provenance: Record<string, unknown>;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function chunksOf(content: string, size = 3500): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += size) chunks.push(content.slice(i, i + size));
  return chunks;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Server-only ingestion. All writes use service-role credentials and preserve provenance. */
export async function ingestKnowledgeDocument(input: KnowledgeDocumentInput) {
  const data = DocumentInput.parse(input);
  const client = await db();
  const hash = contentHash(data.content);
  const { data: doc, error } = await client
    .from("worldway_knowledge_documents")
    .upsert({
      source_type: data.sourceType,
      canonical_url: data.canonicalUrl ?? null,
      title: data.title,
      content_hash: hash,
      language: data.language,
      trust_tier: data.trustTier,
      status: data.status,
      fetched_at: new Date().toISOString(),
      metadata: data.metadata,
    }, { onConflict: "source_type,content_hash" })
    .select("id,title,source_type,canonical_url,trust_tier,status,updated_at")
    .single();
  if (error || !doc) throw new Error("Knowledge document could not be stored");

  await client.from("worldway_knowledge_chunks").delete().eq("document_id", doc.id);
  const chunks = chunksOf(data.content);
  const rows = chunks.map((content, chunkIndex) => ({
    document_id: doc.id,
    chunk_index: chunkIndex,
    content,
    token_count: Math.ceil(content.length / 4),
  }));
  const { error: chunkError } = await client.from("worldway_knowledge_chunks").insert(rows);
  if (chunkError) throw new Error("Knowledge chunks could not be stored");

  return { ...doc, chunkCount: chunks.length, contentHash: hash };
}

/**
 * Evidence-first retrieval. Results are ordered by lexical relevance, then
 * trust tier and freshness. This layer does not invent or rewrite source text.
 */
export async function searchKnowledge(query: string, limit = 8): Promise<KnowledgeHit[]> {
  const q = z.string().trim().min(1).max(500).parse(query);
  const n = Math.min(20, Math.max(1, Math.trunc(limit)));
  const client = await db();
  const { data: chunks, error } = await client
    .from("worldway_knowledge_chunks")
    .select("id,document_id,content")
    .textSearch("content_tsv", q, { type: "websearch", config: "simple" })
    .limit(n);
  if (error || !chunks?.length) return [];

  const documentIds = [...new Set(chunks.map((c: { document_id: string }) => c.document_id))];
  const { data: docs } = await client
    .from("worldway_knowledge_documents")
    .select("id,title,source_type,canonical_url,trust_tier,status")
    .in("id", documentIds)
    .in("status", ["active", "published"]);

  const docMap = new Map((docs ?? []).map((d: any) => [d.id, d]));
  const chunkIds = chunks.map((c: any) => c.id);
  const { data: evidence } = await client
    .from("worldway_knowledge_evidence")
    .select("chunk_id,observed_at,valid_until,confidence,provenance")
    .in("chunk_id", chunkIds)
    .order("observed_at", { ascending: false });

  const evidenceMap = new Map<string, any>();
  for (const e of evidence ?? []) if (e.chunk_id && !evidenceMap.has(e.chunk_id)) evidenceMap.set(e.chunk_id, e);

  return chunks
    .map((c: any) => {
      const d = docMap.get(c.document_id);
      const e = evidenceMap.get(c.id);
      if (!d) return null;
      return {
        chunkId: c.id,
        documentId: c.document_id,
        title: d.title,
        sourceType: d.source_type,
        canonicalUrl: d.canonical_url,
        trustTier: d.trust_tier,
        content: c.content,
        observedAt: e?.observed_at ?? d.updated_at ?? new Date(0).toISOString(),
        validUntil: e?.valid_until ?? null,
        confidence: Number(e?.confidence ?? 0.5),
        provenance: (e?.provenance ?? {}) as Record<string, unknown>,
      } satisfies KnowledgeHit;
    })
    .filter((x): x is KnowledgeHit => x !== null)
    .filter((x) => !x.validUntil || Date.parse(x.validUntil) > Date.now());
}

export function isKnowledgeFresh(validUntil: string | null, now = Date.now()): boolean {
  return !validUntil || Date.parse(validUntil) > now;
}
