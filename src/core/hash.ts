/** sha256 as lowercase hex via Web Crypto (available in browsers and Node >= 19). */
export async function sha256hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) is not available in this environment');
  // Copy into a fresh ArrayBuffer so we never hand a shared/offset view to digest().
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest('SHA-256', copy);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Small synchronous, deterministic 32-bit FNV-1a. Used only to derive stable pseudo-GUIDs for
 * auto-renamed media files (never for integrity — that is sha256hex above).
 */
export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
