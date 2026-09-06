import JSZip from 'jszip';
import { parseManifest, serializeManifest } from './manifest';
import { DEFAULT_THUMBNAIL_NAME, MANIFEST_NAME, type JwManifest } from './types';

export class JwlibraryZipError extends Error {}

export interface JwlibraryZipContents {
  manifest: JwManifest;
  dbBytes: Uint8Array;
  /** Every other root-level file (media referenced by IndependentMedia.FilePath), keyed by name. */
  mediaFiles: Map<string, Uint8Array>;
  defaultThumbnail?: Uint8Array;
}

/** Read a `.jwlibrary` archive: manifest + database bytes + embedded media. */
export async function readJwlibraryZip(bytes: Uint8Array): Promise<JwlibraryZipContents> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new JwlibraryZipError(`Not a valid .jwlibrary (zip) archive: ${(e as Error).message}`);
  }

  const manifestEntry = findRootEntry(zip, MANIFEST_NAME);
  if (!manifestEntry) throw new JwlibraryZipError('Archive has no manifest.json');
  const manifest = parseManifest(await manifestEntry.async('string'));

  const dbName = manifest.userDataBackup.databaseName;
  const dbEntry = findRootEntry(zip, dbName);
  if (!dbEntry) throw new JwlibraryZipError(`Archive has no database file "${dbName}"`);
  const dbBytes = await dbEntry.async('uint8array');

  const mediaFiles = new Map<string, Uint8Array>();
  let defaultThumbnail: Uint8Array | undefined;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = entry.name;
    if (name.includes('/')) continue; // only root-level files matter in a .jwlibrary
    if (name === MANIFEST_NAME || name === dbName) continue;
    const data = await entry.async('uint8array');
    if (name === DEFAULT_THUMBNAIL_NAME) defaultThumbnail = data;
    else mediaFiles.set(name, data);
  }
  return { manifest, dbBytes, mediaFiles, defaultThumbnail };
}

export interface JwlibraryZipParts {
  manifest: JwManifest;
  dbBytes: Uint8Array;
  mediaFiles: Map<string, Uint8Array>;
  defaultThumbnail?: Uint8Array;
}

/** Write a `.jwlibrary` archive (DEFLATE) with everything at the zip root. Returns raw bytes. */
export async function writeJwlibraryZip(parts: JwlibraryZipParts): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(MANIFEST_NAME, serializeManifest(parts.manifest));
  zip.file(parts.manifest.userDataBackup.databaseName, parts.dbBytes);
  if (parts.defaultThumbnail) zip.file(DEFAULT_THUMBNAIL_NAME, parts.defaultThumbnail);
  const names = [...parts.mediaFiles.keys()].sort();
  for (const name of names) zip.file(name, parts.mediaFiles.get(name)!);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function findRootEntry(zip: JSZip, name: string): JSZip.JSZipObject | null {
  const direct = zip.file(name);
  if (direct) return direct;
  // Be lenient about case (Windows-produced archives) but never about directories.
  const lower = name.toLowerCase();
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && !entry.name.includes('/') && entry.name.toLowerCase() === lower) return entry;
  }
  return null;
}
