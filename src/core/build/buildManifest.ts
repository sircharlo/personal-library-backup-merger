import { sha256hex } from '../hash';
import { buildManifest } from '../jwlibrary/manifest';
import type { JwManifest } from '../jwlibrary/types';

export interface BuildManifestForDbInput {
  dbBytes: Uint8Array;
  fileName: string;
  deviceName: string;
  schemaVersion: number;
  lastModified: string;
  now?: Date;
}

/**
 * Manifest for the merged archive. `hash` is always sha256hex of the *built* db bytes — the source
 * manifests' hash field proved unreliable on real files (two devices shared one value), so it is never copied.
 */
export async function buildManifestForDb(input: BuildManifestForDbInput): Promise<{ manifest: JwManifest; dbHash: string }> {
  const dbHash = await sha256hex(input.dbBytes);
  const manifest = buildManifest({
    fileName: input.fileName,
    deviceName: input.deviceName,
    schemaVersion: input.schemaVersion,
    lastModified: input.lastModified,
    dbHash,
    now: input.now,
  });
  return { manifest, dbHash };
}
