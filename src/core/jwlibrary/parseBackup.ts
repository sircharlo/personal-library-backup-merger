import { readJwlibraryZip } from './zip';
import { openDatabase, queryScalar } from './sqlite';
import { checkExpectedSchema, extractSchemaObjects } from './schema';
import { readAllTables, readGrdbMigrationIdentifier, readLastModified, readUserVersion } from './readTables';
import { countTables, emptyAllTables, type ParsedBackup } from './types';

export class BackupParseError extends Error {
  constructor(
    message: string,
    readonly fileName: string,
  ) {
    super(message);
  }
}

/** Parse one `.jwlibrary` file fully into memory (manifest, schema, all rows, media). */
export async function parseBackup(bytes: Uint8Array, fileName: string, sourceIndex: number): Promise<ParsedBackup> {
  try {
    const zip = await readJwlibraryZip(bytes);
    const db = await openDatabase(zip.dbBytes);
    try {
      // Fails with "file is not a database" for garbage bytes.
      queryScalar<number>(db, 'SELECT count(*) FROM sqlite_master');
      const schemaObjects = extractSchemaObjects(db);
      const schemaCheck = checkExpectedSchema(db);
      const tables = schemaCheck.ok ? readAllTables(db) : emptyAllTables();
      const manifest = zip.manifest;
      return {
        sourceIndex,
        fileName,
        deviceName: manifest.userDataBackup.deviceName || fileName,
        manifest,
        schemaVersion: manifest.userDataBackup.schemaVersion,
        grdbMigrationIdentifier: readGrdbMigrationIdentifier(db),
        userVersion: readUserVersion(db),
        schemaObjects,
        schemaCheck,
        tables,
        counts: countTables(tables),
        lastModified: readLastModified(db),
        mediaFiles: zip.mediaFiles,
        defaultThumbnail: zip.defaultThumbnail,
      };
    } finally {
      db.close();
    }
  } catch (e) {
    if (e instanceof BackupParseError) throw e;
    throw new BackupParseError(`${fileName}: ${(e as Error).message}`, fileName);
  }
}
