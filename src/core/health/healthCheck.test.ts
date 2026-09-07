import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from '../../../tests/fixtures/builders';
import { parseSpecs } from '../../../tests/fixtures/harness';
import * as R from '../../../tests/fixtures/rows';
import { checkHealth } from './healthCheck';

const USED = 'm-used.png';
const UNUSED = 'm-unused.png';
const MISSING = 'm-missing.png';

/** One backup exhibiting every category at least once (foreign keys off, like JW Library itself). */
function messySpec(): FixtureSpec {
  return {
    deviceName: 'Messy',
    allowDanglingRefs: true,
    rows: {
      Location: [R.bibleLoc(1, 1, 1), R.bibleLoc(2, 1, 2), R.docLoc(3, 3001), R.pubLoc(4, 'nwtsty'), R.pubLoc(5, 'w'), R.mediaLoc(6, 'pk', 1)],
      UserMark: [
        R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'a', ColorIndex: 1 }),
        R.userMark({ UserMarkId: 2, LocationId: 1, UserMarkGuid: 'b', ColorIndex: 1 }), // exact duplicate of #1
        R.userMark({ UserMarkId: 3, LocationId: 1, UserMarkGuid: 'c', ColorIndex: 2 }), // same ranges, other colour
        R.userMark({ UserMarkId: 4, LocationId: 3, UserMarkGuid: 'd' }), // no ranges
        R.userMark({ UserMarkId: 5, LocationId: 99, UserMarkGuid: 'e' }), // missing location
        R.userMark({ UserMarkId: 6, LocationId: 3, UserMarkGuid: 'f' }), // duplicate range inside
      ],
      BlockRange: [
        R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 2, UserMarkId: 2, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 3, UserMarkId: 3, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 4, UserMarkId: 5, Identifier: 1 }),
        R.blockRange({ BlockRangeId: 5, UserMarkId: 77, Identifier: 1 }), // missing highlight
        R.blockRange({ BlockRangeId: 6, UserMarkId: 6, Identifier: 5 }),
        R.blockRange({ BlockRangeId: 7, UserMarkId: 6, Identifier: 5 }),
      ],
      Note: [
        R.note({ NoteId: 1, Guid: 'n1', LocationId: 1, UserMarkId: 2, Content: 'secret one' }),
        R.note({ NoteId: 2, Guid: 'n2', LocationId: 3, UserMarkId: 1, Content: 'secret two' }), // location differs from highlight
        R.note({ NoteId: 3, Guid: 'n3', Content: 'secret three' }), // standalone
        R.note({ NoteId: 4, Guid: 'n4', LocationId: 3, Content: '  ' }), // empty
        R.note({ NoteId: 5, Guid: 'n5', LocationId: 98, Content: 'secret five' }), // missing location
        R.note({ NoteId: 6, Guid: 'n6', LocationId: 1, UserMarkId: 66, Content: 'secret six' }), // missing highlight
      ],
      Bookmark: [
        R.bookmark({ BookmarkId: 1, LocationId: 1, PublicationLocationId: 5, Slot: 0 }), // nwtsty chapter filed under 'w'
        R.bookmark({ BookmarkId: 2, LocationId: 97, PublicationLocationId: 4, Slot: 1 }), // missing location
      ],
      InputField: [R.inputField(96, 'q', 'v')], // missing location
      Tag: [R.tag(1, 1, 'Used'), R.tag(2, 1, 'Empty'), R.playlistTag(3, 'List')],
      TagMap: [
        R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 }),
        R.tagMap({ TagMapId: 2, TagId: 1, NoteId: 555, Position: 1 }), // deleted note
        R.tagMap({ TagMapId: 3, TagId: 9, NoteId: 3, Position: 0 }), // missing tag
        R.tagMap({ TagMapId: 4, TagId: 3, PlaylistItemId: 1, Position: 0 }),
      ],
      IndependentMedia: [
        R.media({ IndependentMediaId: 1, FilePath: USED, Hash: 'h1' }),
        R.media({ IndependentMediaId: 2, FilePath: UNUSED, Hash: 'h2' }),
        R.media({ IndependentMediaId: 3, FilePath: MISSING, Hash: 'h3' }),
      ],
      PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
      PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'In list', Accuracy: 1 }), R.playlistItem({ PlaylistItemId: 2, Label: 'Loose', Accuracy: 1 })],
      PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
      PlaylistItemLocationMap: [R.pilm({ PlaylistItemId: 1, LocationId: 6 })],
    },
    mediaFiles: { [USED]: R.bytes('used'), [UNUSED]: R.bytes('unused'), 'stray.bin': R.bytes('stray') },
  };
}

function cleanSpec(): FixtureSpec {
  return {
    deviceName: 'Clean',
    rows: {
      Location: [R.bibleLoc(1, 1, 1), R.pubLoc(2, 'nwtsty'), R.docLoc(3, 1001), R.mediaLoc(4, 'pk', 5)],
      UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um' })],
      BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 })],
      Note: [R.note({ NoteId: 1, Guid: 'n', LocationId: 1, UserMarkId: 1, Content: 'x' })],
      Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 1, PublicationLocationId: 2, Slot: 0 })],
      InputField: [R.inputField(3, 'q1', 'a')],
      IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: USED, Hash: 'h1' })],
      Tag: [R.tag(1, 1, 'T'), R.playlistTag(2, 'P')],
      PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
      PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'Item', Accuracy: 1, ThumbnailFilePath: USED })],
      PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
      PlaylistItemLocationMap: [R.pilm({ PlaylistItemId: 1, LocationId: 4 })],
      TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 }), R.tagMap({ TagMapId: 2, TagId: 2, PlaylistItemId: 1, Position: 0 })],
    },
    mediaFiles: { [USED]: R.bytes('used') },
  };
}

describe('health check', () => {
  it('finds every category of orphan and inconsistency', async () => {
    const [src] = await parseSpecs([messySpec()]);
    const report = checkHealth(src.tables, src.mediaFiles.keys());
    const counts = Object.fromEntries(report.findings.map((f) => [f.code, f.count]));
    expect(counts).toEqual({
      A1: 1, A2: 1, A3: 1, A4: 1, A5: 1, A6: 0, A7: 1, A8: 1, A9: 0, A10: 0, A11: 1, A12: 0, A13: 0, A14: 0, A15: 0, A16: 0, A17: 0,
      B1: 1, B2: 1, B3: 1, B4: 2, B5: 1, B6: 1, B7: 1, B8: 1,
      C1: 1, C2: 1, C3: 1, C4: 1, C5: 2, C6: 0,
      D1: 1, D2: 1,
    });
    expect(report.checks).toBe(33);
    expect(report.problemCount).toBe(16);
    for (const f of report.findings) expect(f.samples.length).toBe(Math.min(f.count, 8));
    // Samples describe rows, never note text.
    expect(JSON.stringify(report)).not.toMatch(/secret/);
    expect(report.findings.find((f) => f.code === 'B1')!.samples[0]).toContain('nwtsty');
    expect(report.findings.find((f) => f.code === 'C4')!.cleanup).toBe('duplicateHighlights');
    expect(report.findings.find((f) => f.code === 'C5')!.info).toBe(true);
  });

  it('reports a clean backup as clean', async () => {
    const [src] = await parseSpecs([cleanSpec()]);
    const report = checkHealth(src.tables, src.mediaFiles.keys());
    expect(report.findings.every((f) => f.count === 0)).toBe(true);
    expect(report.problemCount).toBe(0);
  });

  it('skips the archive checks when no file list is given', () => {
    const report = checkHealth({ ...emptyTables() });
    expect(report.findings.some((f) => f.code.startsWith('D'))).toBe(false);
    expect(report.checks).toBe(31);
  });
});

function emptyTables() {
  return {
    Location: [], UserMark: [], BlockRange: [], Note: [], Bookmark: [], InputField: [], IndependentMedia: [], Tag: [], TagMap: [],
    PlaylistItem: [], PlaylistItemAccuracy: [], PlaylistItemIndependentMediaMap: [], PlaylistItemLocationMap: [], PlaylistItemMarker: [],
    PlaylistItemMarkerBibleVerseMap: [], PlaylistItemMarkerParagraphMap: [],
  };
}
