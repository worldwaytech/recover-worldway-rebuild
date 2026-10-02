import { createHash } from "node:crypto";

const MAX_IN_FLIGHT = 256;

const inFlight = new Map<string, Promise<unknown>>();

function hash(parts: unknown[]): string | null {
  try {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Deduplicate only identical, non-mutating requests while they are already in
 * flight. Nothing is persisted and the raw request never becomes a cache key
 * visible to logs or telemetry.
 */
export function withInFlightDedupe<T>(namespace: string, parts: unknown[], fn: () => Promise<T>): Promise<T> {
  const digest = hash([namespace, parts]);
  if (!digest) return fn();

  const existing = inFlight.get(digest);
  if (existing) return existing as Promise<T>;

  if (inFlight.size >= MAX_IN_FLIGHT) return fn();

  const promise = Promise.resolve().then(fn);
  inFlight.set(digest, promise);

  void promise.finally(() => {
    if (inFlight.get(digest) === promise) inFlight.delete(digest);
  }).catch(() => { /* original promise owns the caller-visible failure */ });

  return promise;
}

export function inFlightDedupeSize(): number {
  return inFlight.size;
}
