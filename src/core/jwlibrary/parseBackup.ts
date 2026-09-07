import { readJwlibraryZip } from './zip';
import { openDatabase, queryScalar } from './sqlite';
import { checkExpectedSchema, extractSchemaObjects } from './schema';
import { readAllTables, readGrdbMigrationIdentifier, readLastModified, readUserVersion } from './readTables';
import { countTables, DATA_TABLE_NAMES, emptyAllTables, type ParsedBackup } from './types';
import { createLogger, fmtBytes, fmtCount } from '../util/log';

export class BackupParseError extends Error {
  constructor(
    message: string,
    readonly fileName: string,
  ) {
    super(message);
  }
}

export type ParsePhase = 'unzip' | 'open' | 'schema' | 'tables' | 'done';

export interface ParseBackupOptions {
  onPhase?: (phase: ParsePhase) => void;
}

const log = createLogger('parse');

/** Parse one `.jwlibrary` file fully into memory (manifest, schema, all rows, media). */
export async function parseBackup(bytes: Uint8Array, fileName: string, sourceIndex: number, opts: ParseBackupOptions = {}): Promise<ParsedBackup> {
  const phase = (p: ParsePhase) => opts.onPhase?.(p);
  const total = log.time(`parsed ${fileName}`);
  log.info(`parsing ${fileName} (${fmtBytes(bytes.byteLength)})`);
  try {
    phase('unzip');
    const tUnzip = log.time('unzip');
    const zip = await readJwlibraryZip(bytes);
    tUnzip(`db ${fmtBytes(zip.dbBytes.byteLength)}, ${zip.mediaFiles.size} media files${zip.defaultThumbnail ? ', default thumbnail' : ''}`);
    const manifest = zip.manifest;
    log.debug('manifest', {
      device: manifest.userDataBackup.deviceName,
      schemaVersion: manifest.userDataBackup.schemaVersion,
      lastModifiedDate: manifest.userDataBackup.lastModifiedDate,
      creationDate: manifest.creationDate,
      databaseName: manifest.userDataBackup.databaseName,
    });

    phase('open');
    const tOpen = log.time('open sqlite');
    const db = await openDatabase(zip.dbBytes);
    tOpen();
    try {
      // Fails with "file is not a database" for garbage bytes.
      queryScalar<number>(db, 'SELECT count(*) FROM sqlite_master');

      phase('schema');
      const schemaObjects = extractSchemaObjects(db);
      const schemaCheck = checkExpectedSchema(db);
      const grdbMigrationIdentifier = readGrdbMigrationIdentifier(db);
      const userVersion = readUserVersion(db);
      log.debug(
        `schema: ${schemaObjects.tables.length} tables, ${schemaObjects.indexes.length} indexes, ${schemaObjects.triggers.length} triggers · grdb ${grdbMigrationIdentifier || '?'} · user_version ${userVersion}`,
      );
      if (!schemaCheck.ok) log.warn('schema check failed', schemaCheck);

      phase('tables');
      const tTables = log.time('read tables');
      const tables = schemaCheck.ok ? readAllTables(db) : emptyAllTables();
      const counts = countTables(tables);
      tTables(
        DATA_TABLE_NAMES.filter((t) => counts[t] > 0)
          .map((t) => `${t} ${fmtCount(counts[t])}`)
          .join(', ') || 'no rows',
      );

      const lastModified = readLastModified(db);
      phase('done');
      total();
      return {
        sourceIndex,
        fileName,
        deviceName: manifest.userDataBackup.deviceName || fileName,
        manifest,
        schemaVersion: manifest.userDataBackup.schemaVersion,
        grdbMigrationIdentifier,
        userVersion,
        schemaObjects,
        schemaCheck,
        tables,
        counts,
        lastModified,
        mediaFiles: zip.mediaFiles,
        defaultThumbnail: zip.defaultThumbnail,
      };
    } finally {
      db.close();
    }
  } catch (e) {
    log.error(`failed to parse ${fileName}`, e);
    if (e instanceof BackupParseError) throw e;
    throw new BackupParseError(`${fileName}: ${(e as Error).message}`, fileName);
  }
}
