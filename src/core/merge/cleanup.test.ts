import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from '../../../tests/fixtures/builders';
import { assertDatabaseSound, assertReopenSanity, runMerge } from '../../../tests/fixtures/harness';
import * as R from '../../../tests/fixtures/rows';
import { applyCleanups, DEFAULT_CLEANUPS, type CleanupOptions } from './cleanup';

const USED = 'm-used.png';
const UNUSED = 'm-unused.png';
const ALL_ON: CleanupOptions = { emptyNotes: true, rangelessHighlights: true, duplicateHighlights: true, unusedMedia: true, unreferencedLocations: true };
const ALL_OFF: CleanupOptions = { emptyNotes: false, rangelessHighlights: false, duplicateHighlights: false, unusedMedia: false, unreferencedLocations: false };

function spec(): FixtureSpec {
  return {
    deviceName: 'Untidy',
    rows: {
      Location: [R.bibleLoc(1, 1, 1), R.bibleLoc(2, 1, 2), R.docLoc(3, 3001), R.docLoc(4, 3002)],
      UserMark: [
        R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'a', ColorIndex: 1 }),
        R.userMark({ UserMarkId: 2, LocationId: 1, UserMarkGuid: 'b', ColorIndex: 1 }), // exact duplicate of #1
        R.userMark({ UserMarkId: 3, LocationId: 1, UserMarkGuid: 'c', ColorIndex: 2 }), // overlapping, different colour: kept
        R.userMark({ UserMarkId: 4, LocationId: 1, UserMarkGuid: 'd' }), // no ranges
      ],
      BlockRange: [
        R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 2, UserMarkId: 2, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 3, UserMarkId: 3, Identifier: 1 }),
      ],
      Note: [
        R.note({ NoteId: 1, Guid: 'n1', LocationId: 1, UserMarkId: 1, Content: 'on the first copy' }),
        R.note({ NoteId: 2, Guid: 'n2', LocationId: 1, UserMarkId: 4, Content: 'on the invisible highlight' }),
        R.note({ NoteId: 3, Guid: 'n3', LocationId: 3, Title: ' ', Content: '' }), // empty but tagged: a marker, kept
        R.note({ NoteId: 4, Guid: 'n4', LocationId: 1, UserMarkId: 2, Content: 'on the duplicate copy' }),
        R.note({ NoteId: 5, Guid: 'n5', LocationId: 4, Content: '' }), // empty and untagged; only reference to location 4
      ],
      Tag: [R.tag(1, 1, 'T'), R.playlistTag(2, 'P')],
      TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 3, Position: 0 }), R.tagMap({ TagMapId: 2, TagId: 2, PlaylistItemId: 1, Position: 0 })],
      IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: USED, Hash: 'h1' }), R.media({ IndependentMediaId: 2, FilePath: UNUSED, Hash: 'h2' })],
      PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
      PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'Item', Accuracy: 1 })],
      PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
    },
    mediaFiles: { [USED]: R.bytes('used'), [UNUSED]: R.bytes('unused') },
  };
}

describe('clean-ups on the merged result', () => {
  it('default clean-ups remove leftovers, re-attach notes and keep the output valid', async () => {
    const run = await runMerge([spec()], new Map(), undefined, DEFAULT_CLEANUPS);
    const { tables, counts } = run.result;
    expect(run.cleanup).toMatchObject({
      emptyNotes: 0,
      rangelessHighlights: 1,
      notesDetached: 1,
      duplicateHighlights: 1,
      notesReattached: 1,
      unusedMedia: 1,
      unreferencedLocations: 1,
      removed: { Location: 1, UserMark: 2, BlockRange: 1, IndependentMedia: 1 },
    });
    expect(counts.Location).toBe(3); // unreferenced chapter 2 gone; 3 and 4 kept (empty notes still refer to them)
    expect(counts.UserMark).toBe(2);
    expect(counts.BlockRange).toBe(2);
    expect(counts.Note).toBe(5);
    expect(counts.IndependentMedia).toBe(1);
    expect(tables.UserMark.map((u) => u.UserMarkGuid).sort()).toEqual(['a', 'c']);
    const keeper = tables.UserMark.find((u) => u.UserMarkGuid === 'a')!;
    const byGuid = (g: string) => tables.Note.find((n) => n.Guid === g)!;
    expect(byGuid('n1').UserMarkId).toBe(keeper.UserMarkId);
    expect(byGuid('n4').UserMarkId).toBe(keeper.UserMarkId); // re-attached from the removed duplicate
    expect(byGuid('n2').UserMarkId).toBeNull(); // detached from the invisible highlight, still on its location
    expect(byGuid('n2').LocationId).not.toBeNull();
    expect(run.zipEntries).toContain(USED);
    expect(run.zipEntries).not.toContain(UNUSED);
    expect(run.archive.mediaFileCount).toBe(1);
    expect(run.archive.validation.rowCounts.find((r) => r.table === 'Location')).toMatchObject({ removed: 1, ok: true });
    await assertDatabaseSound(run);
    await assertReopenSanity(run);
  });

  it('removing empty notes spares tagged ones and frees the location only the removed note referenced', async () => {
    const run = await runMerge([spec()], new Map(), undefined, ALL_ON);
    expect(run.cleanup?.emptyNotes).toBe(1);
    expect(run.cleanup?.unreferencedLocations).toBe(2); // chapter 2 and document 3002
    expect(run.result.counts.Note).toBe(4);
    expect(run.result.tables.Note.some((n) => n.Guid === 'n3')).toBe(true); // empty but tagged: kept
    expect(run.result.tables.Note.some((n) => n.Guid === 'n5')).toBe(false);
    expect(run.result.counts.Location).toBe(2);
    expect(run.result.counts.TagMap).toBe(2); // the tagged empty note keeps its tag
    await assertDatabaseSound(run);
    await assertReopenSanity(run);
  });

  it('with everything off the tables are untouched', async () => {
    const plain = await runMerge([spec()]);
    const off = await runMerge([spec()], new Map(), undefined, ALL_OFF);
    expect(off.result.tables).toEqual(plain.result.tables);
    expect(off.cleanup?.removed).toEqual({});
    expect(off.zipEntries).toEqual(plain.zipEntries);
  });

  it('is a pure function of its inputs', async () => {
    const plain = await runMerge([spec()]);
    const a = applyCleanups(plain.result.tables, plain.analysis.mediaFiles, DEFAULT_CLEANUPS);
    const b = applyCleanups(plain.result.tables, plain.analysis.mediaFiles, DEFAULT_CLEANUPS);
    expect(a.tables).toEqual(b.tables);
    expect(a.summary).toEqual(b.summary);
    // The input was not mutated.
    expect(plain.result.tables.UserMark.length).toBe(4);
    expect(plain.analysis.mediaFiles.size).toBe(2);
  });
});
