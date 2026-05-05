const SIGNATURE_VERSION = 1;

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

function normalizeForSignature(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : String(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForSignature);
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (typeof entry === 'function') {
        continue;
      }
      normalized[key] = normalizeForSignature(entry);
    }
    return normalized;
  }
  return String(value);
}

export function stableStringifyForNavmeshSignature(value: unknown): string {
  return JSON.stringify(normalizeForSignature(value));
}

function cyrb53(value: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const numericHash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return numericHash.toString(16).padStart(14, '0');
}

export function computeNavmeshBakeSignature(input: unknown): string {
  const payload = stableStringifyForNavmeshSignature({
    signatureVersion: SIGNATURE_VERSION,
    input,
  });
  return `navmesh-bake-v${SIGNATURE_VERSION}-${cyrb53(payload)}`;
}

