import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildFixtureBytes } from '../../../tests/fixtures/builders';
import * as R from '../../../tests/fixtures/rows';
import { BackupParseError, parseBackup } from './parseBackup';
import { parseManifest, ManifestError } from './manifest';
import { readJwlibraryZip, JwlibraryZipError } from './zip';

describe('parseBackup', () => {
  it('parses a synthetic backup end to end', async () => {
    const bytes = await buildFixtureBytes({
      deviceName: 'iPhone',
      lastModified: '2026-02-02T02:02:02Z',
      grdbMigration: 'v16',
      rows: { Location: [R.bibleLoc(1, 1, 1)], Note: [R.note({ NoteId: 1, Guid: 'g', LocationId: 1, Content: 'c' })] },
      mediaFiles: { 'm.png': R.bytes('PNG') },
    });
    const b = await parseBackup(bytes, 'x.jwlibrary', 3);
    expect(b.sourceIndex).toBe(3);
    expect(b.deviceName).toBe('iPhone');
    expect(b.schemaVersion).toBe(16);
    expect(b.grdbMigrationIdentifier).toBe('v16');
    expect(b.userVersion).toBe(16);
    expect(b.lastModified).toBe('2026-02-02T02:02:02Z');
    expect(b.manifest.userDataBackup.lastModifiedDate).toBe('2026-02-02T02:02:02+00:00');
    expect(b.schemaCheck.ok).toBe(true);
    expect(b.schemaObjects.tables.map((t) => t.name)).toContain('Location');
    expect(b.schemaObjects.indexes.length).toBe(15);
    expect(b.schemaObjects.triggers.length).toBe(29);
    expect(b.counts.Note).toBe(1);
    expect(b.tables.Note[0]).toMatchObject({ NoteId: 1, Guid: 'g', Content: 'c' });
    expect(b.tables.Location[0].BookNumber).toBe(1);
    expect(b.mediaFiles.get('m.png')).toBeDefined();
    expect(b.defaultThumbnail).toBeDefined();
  });

  it('rejects a corrupt database with a scoped error', async () => {
    const bytes = await buildFixtureBytes({ deviceName: 'Broken', corruptDb: true });
    await expect(parseBackup(bytes, 'broken.jwlibrary', 0)).rejects.toBeInstanceOf(BackupParseError);
    await expect(parseBackup(bytes, 'broken.jwlibrary', 0)).rejects.toThrow(/broken\.jwlibrary/);
  });

  it('rejects non-zip bytes and archives without a manifest', async () => {
    await expect(parseBackup(new TextEncoder().encode('nope'), 'nope.jwlibrary', 0)).rejects.toBeInstanceOf(BackupParseError);
    const zip = new JSZip();
    zip.file('userData.db', 'x');
    const noManifest = await zip.generateAsync({ type: 'uint8array' });
    await expect(readJwlibraryZip(noManifest)).rejects.toBeInstanceOf(JwlibraryZipError);
  });

  it('reports a missing-schema database as a failed schema check rather than crashing', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ name: 'x', userDataBackup: { schemaVersion: 16, deviceName: 'D', databaseName: 'userData.db' } }));
    // A valid but empty SQLite database.
    const { createEmptyDatabase } = await import('./sqlite');
    const db = await createEmptyDatabase();
    db.exec('CREATE TABLE placeholder (x)');
    zip.file('userData.db', db.export());
    db.close();
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const b = await parseBackup(bytes, 'empty.jwlibrary', 0);
    expect(b.schemaCheck.ok).toBe(false);
    expect(b.schemaCheck.missingTables).toContain('Note');
  });
});

describe('parseManifest', () => {
  it('requires a numeric schemaVersion', () => {
    expect(() => parseManifest('{}')).toThrow(ManifestError);
    expect(() => parseManifest('{"userDataBackup":{}}')).toThrow(ManifestError);
    expect(() => parseManifest('not json')).toThrow(ManifestError);
    const m = parseManifest('{"userDataBackup":{"schemaVersion":16}}');
    expect(m.userDataBackup.databaseName).toBe('userData.db');
  });
});
