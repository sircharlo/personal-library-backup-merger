/**
 * Builds tiny, fully synthetic `.jwlibrary` fixtures at test time with the *real* sql.js + JSZip
 * code paths, from the pinned personal-data-free `schemaFixture.sql`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertAllTables } from '../../src/core/build/buildDatabase';
import { sha256hex } from '../../src/core/hash';
import { createEmptyDatabase } from '../../src/core/jwlibrary/sqlite';
import { emptyAllTables, type AllTables, type JwManifest } from '../../src/core/jwlibrary/types';
import { writeJwlibraryZip } from '../../src/core/jwlibrary/zip';
import { toManifestUtcOffsetFormat } from '../../src/core/util/datetime';

const SCHEMA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'schemaFixture.sql');

/** The three triggers present on the iPhone/iPad (grdb v16) schema variant but absent on Desktop (v14). */
export const INPUT_FIELD_TRIGGERS_SQL = `
CREATE TRIGGER TR_Update_LastModified_Insert_InputField
	INSERT ON InputField
	BEGIN
		UPDATE LastModified SET LastModified = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
	END;
CREATE TRIGGER TR_Update_LastModified_Update_InputField
	UPDATE ON InputField
	BEGIN
		UPDATE LastModified SET LastModified = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
	END;
CREATE TRIGGER TR_Update_LastModified_Delete_InputField
	DELETE ON InputField
	BEGIN
		UPDATE LastModified SET LastModified = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
	END;
`;

let schemaCache: { beforeTriggers: string; triggers: string } | null = null;

/** DDL split into "tables + indexes" and "triggers" so LastModified can be seeded before its guard triggers exist. */
export function loadSchemaFixture(): { beforeTriggers: string; triggers: string } {
  if (!schemaCache) {
    const text = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const idx = text.search(/^CREATE TRIGGER/m);
    if (idx < 0) throw new Error('schemaFixture.sql has no triggers?');
    schemaCache = { beforeTriggers: text.slice(0, idx), triggers: text.slice(idx) };
  }
  return schemaCache;
}

export interface FixtureSpec {
  deviceName: string;
  fileName?: string;
  /** manifest.userDataBackup.schemaVersion (default 16). */
  schemaVersion?: number;
  /** grdb_migrations identifier (default "v16"). */
  grdbMigration?: string;
  /** Add the three InputField LastModified triggers (iPhone/iPad-style schema). Default: true when grdbMigration is "v16". */
  v16Triggers?: boolean;
  /** LastModified singleton (default "2026-01-01T00:00:00Z"). */
  lastModified?: string;
  /** PRAGMA user_version (default = schemaVersion). */
  userVersion?: number;
  rows?: Partial<AllTables>;
  /** Root-level media files (name = IndependentMedia.FilePath). */
  mediaFiles?: Record<string, Uint8Array>;
  /** default_thumbnail.png bytes; null = omit. */
  defaultThumbnail?: Uint8Array | null;
  /** Override manifest hash (real devices sometimes ship a stale one). */
  manifestHash?: string;
  /** Replace the database with garbage bytes (corrupt-file scenario). */
  corruptDb?: boolean;
  /** Insert rows with foreign keys OFF, like JW Library itself does, so fixtures can carry dangling references. */
  allowDanglingRefs?: boolean;
}

export const DEFAULT_FIXTURE_LAST_MODIFIED = '2026-01-01T00:00:00Z';

export async function buildFixtureDbBytes(spec: FixtureSpec): Promise<Uint8Array> {
  const { beforeTriggers, triggers } = loadSchemaFixture();
  const grdb = spec.grdbMigration ?? 'v16';
  const v16Triggers = spec.v16Triggers ?? grdb === 'v16';
  const schemaVersion = spec.schemaVersion ?? 16;

  const db = await createEmptyDatabase();
  try {
    db.exec(`PRAGMA foreign_keys = ${spec.allowDanglingRefs ? 'OFF' : 'ON'}`);
    db.exec(beforeTriggers);
    db.run('INSERT INTO LastModified (LastModified) VALUES (?)', [spec.lastModified ?? DEFAULT_FIXTURE_LAST_MODIFIED]);
    db.run('INSERT INTO grdb_migrations (identifier) VALUES (?)', [grdb]);
    insertAllTables(db, { ...emptyAllTables(), ...(spec.rows ?? {}) });
    db.exec(triggers);
    if (v16Triggers) db.exec(INPUT_FIELD_TRIGGERS_SQL);
    db.exec(`PRAGMA user_version = ${spec.userVersion ?? schemaVersion}`);
    return db.export();
  } finally {
    db.close();
  }
}

export async function buildFixtureBytes(spec: FixtureSpec): Promise<Uint8Array> {
  const schemaVersion = spec.schemaVersion ?? 16;
  const lastModified = spec.lastModified ?? DEFAULT_FIXTURE_LAST_MODIFIED;
  const fileName = spec.fileName ?? `UserdataBackup_2026-09-06_${spec.deviceName}.jwlibrary`;
  const dbBytes = spec.corruptDb ? new TextEncoder().encode('this is definitely not a SQLite database') : await buildFixtureDbBytes(spec);
  const manifest: JwManifest = {
    name: fileName,
    creationDate: '2026-09-06T10:00:00.0000000-04:00',
    version: 1,
    type: 0,
    userDataBackup: {
      lastModifiedDate: toManifestUtcOffsetFormat(lastModified),
      deviceName: spec.deviceName,
      databaseName: 'userData.db',
      hash: spec.manifestHash ?? (await sha256hex(dbBytes)),
      schemaVersion,
    },
  };
  const mediaFiles = new Map<string, Uint8Array>(Object.entries(spec.mediaFiles ?? {}));
  const defaultThumbnail = spec.defaultThumbnail === null ? undefined : (spec.defaultThumbnail ?? new TextEncoder().encode(`PNG-THUMB-${spec.deviceName}`));
  return writeJwlibraryZip({ manifest, dbBytes, mediaFiles, defaultThumbnail });
}
