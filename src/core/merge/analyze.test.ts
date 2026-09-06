import { describe, expect, it } from 'vitest';
import { parseSpecs, runMerge } from '../../../tests/fixtures/harness';
import * as R from '../../../tests/fixtures/rows';
import { analyze, makeSourceLabels, validateCompatibility } from './analyze';
import { IncompatibleBackupsError } from './errors';

describe('compatibility', () => {
  it('blocks on schemaVersion mismatch', async () => {
    const sources = await parseSpecs([
      { deviceName: 'iPhone', schemaVersion: 16, rows: { Location: [R.bibleLoc(1, 1, 1)] } },
      { deviceName: 'iPad', schemaVersion: 15, rows: { Location: [R.bibleLoc(1, 1, 1)] } },
    ]);
    const report = validateCompatibility(sources);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toMatch(/incompatible app versions/);
    expect(report.schemaVersion).toBeNull();
    expect(() => analyze(sources)).toThrow(IncompatibleBackupsError);
  });

  it('warns (does not block) on grdb_migrations differences and picks the highest as template', async () => {
    const sources = await parseSpecs([
      { deviceName: 'DESKTOP', grdbMigration: 'v14', v16Triggers: false },
      { deviceName: 'iPhone', grdbMigration: 'v16' },
    ]);
    const report = validateCompatibility(sources);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(1);
    expect(report.templateSourceIndex).toBe(1);
    expect(sources[0].schemaObjects.triggers).toHaveLength(26);
    expect(sources[1].schemaObjects.triggers).toHaveLength(29);
    expect(analyze(sources).templateSchema.triggers).toHaveLength(29);
  });

  it('breaks template ties by upload order', async () => {
    const sources = await parseSpecs([{ deviceName: 'A' }, { deviceName: 'B' }]);
    expect(validateCompatibility(sources).templateSourceIndex).toBe(0);
  });

  it('rejects an empty list', () => {
    expect(validateCompatibility([]).ok).toBe(false);
    expect(() => analyze([])).toThrow(IncompatibleBackupsError);
  });

  it('disambiguates duplicate device names', async () => {
    const sources = await parseSpecs([{ deviceName: 'iPhone' }, { deviceName: 'iPhone' }, { deviceName: 'iPad' }]);
    expect(makeSourceLabels(sources)).toEqual(['iPhone', 'iPhone (2)', 'iPad']);
  });
});

describe('robustness', () => {
  it('keeps Location Title from whichever source has one', async () => {
    const sources = await parseSpecs([
      { deviceName: 'A', rows: { Location: [R.docLoc(1, 1001, 'w')] } },
      { deviceName: 'B', rows: { Location: [R.docLoc(1, 1001, 'w', { Title: 'Watchtower study' })] } },
    ]);
    const a = analyze(sources);
    expect(a.merged.Location).toHaveLength(1);
    expect(a.merged.Location[0].Title).toBe('Watchtower study');
    expect(a.auto.locationsDeduped).toBe(1);
  });

  it('never merges two rows of the same source, even when their identity keys match', async () => {
    const sources = await parseSpecs([
      {
        deviceName: 'A',
        rows: {
          Location: [R.docLoc(1, 1001, 'w'), R.docLoc(2, 1001, 'w')],
          IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'x.png', Hash: 'h' }), R.media({ IndependentMediaId: 2, FilePath: 'y.png', Hash: 'h' })],
        },
      },
      { deviceName: 'B', rows: { Location: [R.docLoc(9, 1001, 'w')], IndependentMedia: [R.media({ IndependentMediaId: 5, FilePath: 'z.png', Hash: 'h' })] } },
    ]);
    const a = analyze(sources);
    expect(a.merged.Location).toHaveLength(2);
    expect(a.merged.IndependentMedia).toHaveLength(2);
    expect(a.idMaps[1].globalId('Location', 9)).toBe(1);
    expect(a.idMaps[1].globalId('IndependentMedia', 5)).toBe(1);
  });

  it('collects media bytes from whichever source has the file', async () => {
    const sources = await parseSpecs([
      { deviceName: 'A', rows: { IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'a.png', Hash: 'h' })] } }, // file missing!
      { deviceName: 'B', rows: { IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'b.png', Hash: 'h' })] }, mediaFiles: { 'b.png': R.bytes('PNG') } },
    ]);
    const a = analyze(sources);
    expect(a.merged.IndependentMedia).toHaveLength(1);
    expect(a.merged.IndependentMedia[0].FilePath).toBe('a.png');
    expect(a.mediaFiles.get('a.png')).toBeDefined();
    expect(a.warnings.some((w) => /missing from the archive/.test(w))).toBe(true);
  });

  it('leaves out tag assignments that already dangle in the source (real backups carry these) and still validates', async () => {
    // Shaped after the real iPhone/iPad backups: 6 TagMap rows each pointing at a deleted note.
    const run = await runMerge([
      {
        deviceName: 'iPhone',
        allowDanglingRefs: true,
        rows: {
          Note: [R.note({ NoteId: 1, Guid: 'kept', Content: 'kept' })],
          Tag: [R.tag(1, 1, 'Study')],
          TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 }), R.tagMap({ TagMapId: 2, TagId: 1, NoteId: 999, Position: 1 })],
        },
      },
      { deviceName: 'iPad', rows: { Note: [R.note({ NoteId: 5, Guid: 'other', Content: 'other' })], Tag: [R.tag(3, 1, 'Study')], TagMap: [R.tagMap({ TagMapId: 9, TagId: 3, NoteId: 5, Position: 0 })] } },
    ]);
    expect(run.result.counts.TagMap).toBe(2);
    expect(run.result.counts.Note).toBe(2);
    expect(run.analysis.warnings).toHaveLength(1);
    expect(run.analysis.warnings[0]).toMatch(/iPhone: tag assignment #2 points at a note that no longer exists/);
    expect(run.analysis.idMaps[0].get('TagMap', 2)).toMatchObject({ kind: 'dropped' });
    expect(run.archive.validation.ok).toBe(true);
    expect(run.archive.validation.foreignKeyViolations).toBe(0);
    expect(run.result.tables.TagMap.map((t) => t.Position).sort()).toEqual([0, 1]);
  });

  it('flags a highlight whose ranges differ as a conflict, and pairs identical ranges otherwise', async () => {
    const mk = (ids: number[]) => ({
      Location: [R.bibleLoc(1, 1, 1)],
      UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'g' })],
      BlockRange: ids.map((i) => R.blockRange({ BlockRangeId: i, UserMarkId: 1, Identifier: i })),
    });
    const differ = analyze(await parseSpecs([{ deviceName: 'A', rows: mk([1, 2]) }, { deviceName: 'B', rows: mk([1]) }]));
    expect(differ.conflicts).toHaveLength(1);
    expect(differ.conflicts[0].kind).toBe('userMark');
    const same = analyze(await parseSpecs([{ deviceName: 'A', rows: mk([1, 2]) }, { deviceName: 'B', rows: mk([2, 1]) }]));
    expect(same.conflicts).toEqual([]);
    expect(same.merged.BlockRange).toHaveLength(2);
    expect(same.auto.blockRangesDeduped).toBe(2);
  });
});
