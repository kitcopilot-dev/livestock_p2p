/**
 * Deterministic JSON serialization: keys sorted depth-first, no whitespace.
 * Used for hash chaining (audit log), webhook HMAC payloads, and idempotency
 * request fingerprints so that equal objects always hash equal.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const v = record[key];
      if (v === undefined) continue;
      out[key] = sortValue(v);
    }
    return out;
  }
  return value;
}
