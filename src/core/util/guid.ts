import { fnv1a32 } from '../hash';

/** Random RFC 4122 v4 GUID (lowercase), for non-deterministic contexts only. */
export function newRandomGuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return formatGuidBytes(bytes);
}

/**
 * Deterministic GUID-shaped string derived from a seed. Used for auto-renaming media files on
 * FilePath collisions so that `analyze()` stays a pure function of its inputs (same inputs →
 * byte-identical output), which the determinism invariant in the test-suite relies on.
 */
export function deterministicGuid(seed: string): string {
  const bytes = new Uint8Array(16);
  const words = [fnv1a32(seed, 0x811c9dc5), fnv1a32(seed, 0x9e3779b9), fnv1a32(seed, 0x85ebca6b), fnv1a32(seed, 0xc2b2ae35)];
  for (let w = 0; w < 4; w++) {
    bytes[w * 4] = (words[w] >>> 24) & 0xff;
    bytes[w * 4 + 1] = (words[w] >>> 16) & 0xff;
    bytes[w * 4 + 2] = (words[w] >>> 8) & 0xff;
    bytes[w * 4 + 3] = words[w] & 0xff;
  }
  return formatGuidBytes(bytes);
}

function formatGuidBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Split "name.ext" → { base, ext } where ext includes the dot ("" when none). */
export function splitExtension(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf('.');
  if (i <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, i), ext: fileName.slice(i) };
}
