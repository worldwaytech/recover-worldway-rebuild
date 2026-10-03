const MAX_OUTPUT_BYTES = 16_000;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 32;
const MAX_STRING_LENGTH = 2_000;
const MAX_KEY_LENGTH = 120;

const BLOCKED_AUTHORITY_KEYS = new Set([
  "execute", "execution", "executionauthority", "mutate", "mutation",
  "booking", "book", "payment", "pay", "refund", "cancel",
  "suppliermutation", "supplieraction", "tool", "toolcall",
  "credential", "credentials", "secret", "secrets", "highriskgrant",
]);

function allowedKey(key: string): boolean {
  return !BLOCKED_AUTHORITY_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowedKey(key)) continue;
    const sanitized = sanitizeValue(item, depth + 1);
    if (sanitized !== undefined) output[key.slice(0, MAX_KEY_LENGTH)] = sanitized;
  }
  return output;
}

export function sanitizeSpecialistAdvisoryOutput(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sanitized = sanitizeValue(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return null;

  try {
    const serialized = JSON.stringify(sanitized);
    if (!serialized || serialized.length > MAX_OUTPUT_BYTES) return null;
  } catch {
    return null;
  }

  return sanitized as Record<string, unknown>;
}
