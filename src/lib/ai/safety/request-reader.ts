// Central validation for the AI request reader's structured output.
// The model may only describe what the customer asked for. Anything that looks
// like a commercial fact is rejected, injected text is removed, and references
// must match deterministic journey data.
import { IntentSchema, type ExtractedIntent } from "../intent";
import { assertNoAuthorityFields, AuthorityViolationError } from "./authority";
import { scanForInjection } from "./content";
import { emit } from "../router/telemetry";

export interface ReaderGuardResult {
  intent: ExtractedIntent | null;
  rejected: string[];
}

const textFields = (i: ExtractedIntent) => [i.question ?? "", ...i.interests, ...i.edits.map((e) => e.detail), ...i.destinations, i.origin ?? ""];

/**
 * @param raw  model output (before or after schema parse)
 * @param knownRefs  component references from the deterministic journey version
 */
export function guardIntent(raw: unknown, knownRefs: string[] = [], correlationId = "reader"): ReaderGuardResult {
  const rejected: string[] = [];
  // 1. Commercial facts are never accepted from the model (checked before parsing strips them).
  try { assertNoAuthorityFields(raw); } catch (e) {
    if (e instanceof AuthorityViolationError) {
      rejected.push(...e.facts.map((f) => `authority:${f}`));
      emit({ type: "authority.violation", correlationId, task: "intent_extraction", outcome: "fields_dropped", reason: e.facts.join(",") });
    } else throw e;
  }
  // 2. Strict schema (unknown keys stripped).
  const parsed = IntentSchema.safeParse(raw);
  if (!parsed.success) {
    emit({ type: "model.call", correlationId, task: "intent_extraction", validation: "failed", outcome: "invalid_output" });
    return { intent: null, rejected: [...rejected, "schema"] };
  }
  const intent: ExtractedIntent = structuredClone(parsed.data);
  // 3. Injection: an extracted field that carries instructions is discarded.
  if (textFields(intent).some((t) => scanForInjection(t).length)) {
    rejected.push("injection");
    intent.question = intent.question && scanForInjection(intent.question).length ? null : intent.question;
    intent.interests = intent.interests.filter((t) => !scanForInjection(t).length);
    intent.edits = intent.edits.filter((e) => !scanForInjection(e.detail).length);
    intent.destinations = intent.destinations.filter((t) => !scanForInjection(t).length);
    if (intent.origin && scanForInjection(intent.origin).length) intent.origin = null;
    emit({ type: "safety.flag", correlationId, task: "intent_extraction", outcome: "fields_removed", reason: "injection" });
  }
  // 4. Deterministic data wins: component refs must exist in the journey.
  const known = new Set(knownRefs);
  intent.edits = intent.edits.map((e) => {
    if (e.componentRef && !known.has(e.componentRef)) { rejected.push(`unknown_ref:${e.componentRef.slice(0, 40)}`); return { ...e, componentRef: null }; }
    return e;
  });
  emit({ type: "model.call", correlationId, task: "intent_extraction", validation: rejected.length ? "repaired" : "passed", outcome: "reader_guarded" });
  return { intent, rejected };
}
