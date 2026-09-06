import type { JwManifest } from './types';
import { DEFAULT_DATABASE_NAME } from './types';
import { formatIsoWithLocalOffset, toManifestUtcOffsetFormat } from '../util/datetime';

export class ManifestError extends Error {}

/** Parse and minimally validate a `manifest.json` from a `.jwlibrary` archive. */
export function parseManifest(text: string): JwManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ManifestError(`manifest.json is not valid JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== 'object') throw new ManifestError('manifest.json is not an object');
  const m = raw as Partial<JwManifest>;
  const udb = m.userDataBackup;
  if (!udb || typeof udb !== 'object') throw new ManifestError('manifest.json is missing "userDataBackup"');
  if (typeof udb.schemaVersion !== 'number' || !Number.isFinite(udb.schemaVersion)) {
    throw new ManifestError('manifest.json is missing a numeric "userDataBackup.schemaVersion"');
  }
  return {
    name: typeof m.name === 'string' ? m.name : '',
    creationDate: typeof m.creationDate === 'string' ? m.creationDate : '',
    version: typeof m.version === 'number' ? m.version : 1,
    type: typeof m.type === 'number' ? m.type : 0,
    userDataBackup: {
      lastModifiedDate: typeof udb.lastModifiedDate === 'string' ? udb.lastModifiedDate : '',
      deviceName: typeof udb.deviceName === 'string' ? udb.deviceName : '',
      databaseName: typeof udb.databaseName === 'string' && udb.databaseName ? udb.databaseName : DEFAULT_DATABASE_NAME,
      hash: typeof udb.hash === 'string' ? udb.hash : '',
      schemaVersion: udb.schemaVersion,
    },
  };
}

export interface BuildManifestInput {
  fileName: string;
  deviceName: string;
  schemaVersion: number;
  /** The `LastModified` value written into the merged database (e.g. "2026-07-10T22:56:20Z"). */
  lastModified: string;
  /** sha256 hex of the built `userData.db` bytes — always self-computed. */
  dbHash: string;
  /** Injectable for deterministic tests. */
  now?: Date;
}

export function buildManifest(input: BuildManifestInput): JwManifest {
  return {
    name: input.fileName,
    creationDate: formatIsoWithLocalOffset(input.now ?? new Date()),
    version: 1,
    type: 0,
    userDataBackup: {
      lastModifiedDate: toManifestUtcOffsetFormat(input.lastModified),
      deviceName: input.deviceName,
      databaseName: DEFAULT_DATABASE_NAME,
      hash: input.dbHash,
      schemaVersion: input.schemaVersion,
    },
  };
}

export function serializeManifest(manifest: JwManifest): string {
  return JSON.stringify(manifest);
}
