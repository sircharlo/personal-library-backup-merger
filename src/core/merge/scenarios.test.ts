/**
 * The 12 fixture scenarios from the plan (§7) plus the cross-cutting invariants asserted against every one.
 * Every fixture is a tiny synthetic `.jwlibrary` built at test time — no real backup data anywhere.
 */
import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from '../../../tests/fixtures/builders';
import {
  assertAllInvariants,
  assertDeterminism,
  assertIdempotency,
  openResultDb,
  rows,
  runMerge,
  sumCounts,
  FIXED_NOW,
} from '../../../tests/fixtures/harness';
import * as R from '../../../tests/fixtures/rows';
import { emptyAutoSummary } from './context';
import { queryScalar } from '../jwlibrary/sqlite';
import { DATA_TABLE_NAMES } from '../jwlibrary/types';

// ---------------------------------------------------------------------------
// Fixture specs
// ---------------------------------------------------------------------------

const PNG1 = 'a1b2c3d4-0000-4000-8000-000000000001.png';
const MP4_2 = 'a1b2c3d4-0000-4000-8000-000000000002';

function richRows(): FixtureSpec['rows'] {
  return {
    Location: [R.bibleLoc(1, 1, 1), R.pubLoc(2, 'nwtsty'), R.docLoc(3, 1001, 'w', { IssueTagNumber: 20240100 }), R.mediaLoc(4, 'pk', 5)],
    UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-a' })],
    BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 }), R.blockRange({ BlockRangeId: 2, UserMarkId: 1, Identifier: 2 })],
    Note: [
      R.note({ NoteId: 1, Guid: 'note-a', LocationId: 1, UserMarkId: 1, Title: 'A', Content: 'alpha' }),
      R.note({ NoteId: 2, Guid: 'note-a2', LocationId: 3, Content: 'doc note', BlockType: 1, BlockIdentifier: 4 }),
    ],
    Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 1, PublicationLocationId: 2, Slot: 0 })],
    InputField: [R.inputField(3, 'q1', 'answer a')],
    IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: PNG1, Hash: 'hash-a' })],
    Tag: [R.tag(1, 1, 'Alpha'), R.playlistTag(2, 'Pics')],
    PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
    PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'Sunset', Accuracy: 1, ThumbnailFilePath: PNG1 })],
    PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
    PlaylistItemLocationMap: [R.pilm({ PlaylistItemId: 1, LocationId: 4, BaseDurationTicks: 999 })],
    PlaylistItemMarker: [R.marker({ PlaylistItemMarkerId: 1, PlaylistItemId: 1, StartTimeTicks: 100 })],
    PlaylistItemMarkerBibleVerseMap: [R.verseMap(1, 1001001)],
    PlaylistItemMarkerParagraphMap: [R.paragraphMap(1, 555, 3)],
    TagMap: [
      R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 }),
      R.tagMap({ TagMapId: 2, TagId: 1, LocationId: 3, Position: 1 }),
      R.tagMap({ TagMapId: 3, TagId: 2, PlaylistItemId: 1, Position: 0 }),
    ],
  };
}

const richMedia = () => ({ [PNG1]: R.bytes('PNG-1') });

const S = {
  nonOverlappingUnion: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      lastModified: '2026-02-01T00:00:00Z',
      rows: {
        Location: [R.bibleLoc(1, 1, 1), R.pubLoc(2, 'nwtsty'), R.docLoc(3, 1001, 'w')],
        UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-a' })],
        BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 })],
        Note: [R.note({ NoteId: 1, Guid: 'note-a', LocationId: 1, UserMarkId: 1, Title: 'A', Content: 'alpha' })],
        Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 1, PublicationLocationId: 2, Slot: 0 })],
        InputField: [R.inputField(3, 'q1', 'answer a')],
        Tag: [R.tag(1, 1, 'Alpha')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 })],
      },
    },
    {
      deviceName: 'iPad',
      lastModified: '2026-03-01T00:00:00Z',
      rows: {
        Location: [R.bibleLoc(1, 2, 2), R.pubLoc(2, 'bhs'), R.docLoc(3, 2002, 'bhs')],
        UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-b', ColorIndex: 2 })],
        BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 3 })],
        Note: [R.note({ NoteId: 1, Guid: 'note-b', LocationId: 1, Content: 'beta' })],
        Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 1, PublicationLocationId: 2, Slot: 0 })],
        InputField: [R.inputField(3, 'q1', 'answer b')],
        Tag: [R.tag(1, 1, 'Beta')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 })],
      },
    },
  ],

  exactDuplicate: (): FixtureSpec[] => [
    { deviceName: 'iPhone', rows: richRows(), mediaFiles: richMedia() },
    { deviceName: 'iPad', rows: richRows(), mediaFiles: richMedia() },
  ],

  noteConflict: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      lastModified: '2026-09-06T14:54:00Z',
      rows: {
        Location: [R.bibleLoc(1, 43, 3)],
        Note: [R.note({ NoteId: 1, Guid: 'shared-note', LocationId: 1, Content: 'Many reasons, but the Bible summed it all up', LastModified: '2024-01-02T10:00:00Z' })],
      },
    },
    {
      deviceName: 'iPad',
      lastModified: '2026-09-06T14:56:53Z',
      rows: {
        Location: [R.bibleLoc(1, 43, 3)],
        Note: [
          R.note({
            NoteId: 1,
            Guid: 'shared-note',
            LocationId: 1,
            Content: 'How possible? \nMany reasons, but the Bible summed it all up',
            LastModified: '2026-09-06T14:56:00Z',
          }),
        ],
      },
    },
  ],

  inputFieldConflict: (): FixtureSpec[] => [
    { deviceName: 'iPhone', lastModified: '2026-01-01T00:00:00Z', rows: { Location: [R.docLoc(1, 1001)], InputField: [R.inputField(1, 'q1', 'first answer')] } },
    { deviceName: 'iPad', lastModified: '2026-06-01T00:00:00Z', rows: { Location: [R.docLoc(1, 1001)], InputField: [R.inputField(1, 'q1', 'second answer')] } },
  ],

  bookmarkSlotCollision: (): FixtureSpec[] => [
    { deviceName: 'iPhone', rows: { Location: [R.pubLoc(1, 'nwtsty'), R.bibleLoc(2, 1, 1)], Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 2, PublicationLocationId: 1, Slot: 0, Title: 'Genesis 1' })] } },
    { deviceName: 'iPad', rows: { Location: [R.pubLoc(1, 'nwtsty'), R.bibleLoc(2, 1, 2)], Bookmark: [R.bookmark({ BookmarkId: 1, LocationId: 2, PublicationLocationId: 1, Slot: 0, Title: 'Genesis 2' })] } },
  ],

  tagPositionCollision: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      rows: {
        Note: [R.note({ NoteId: 1, Guid: 'n1', Content: 'one' }), R.note({ NoteId: 2, Guid: 'n2', Content: 'two' })],
        Tag: [R.tag(1, 1, 'Study')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 1, Position: 0 }), R.tagMap({ TagMapId: 2, TagId: 1, NoteId: 2, Position: 1 })],
      },
    },
    {
      deviceName: 'iPad',
      rows: {
        Note: [R.note({ NoteId: 1, Guid: 'n3', Content: 'three' }), R.note({ NoteId: 2, Guid: 'n4', Content: 'four' }), R.note({ NoteId: 3, Guid: 'n1', Content: 'one' })],
        Tag: [R.tag(5, 1, 'Study')],
        TagMap: [
          R.tagMap({ TagMapId: 1, TagId: 5, NoteId: 1, Position: 0 }),
          R.tagMap({ TagMapId: 2, TagId: 5, NoteId: 2, Position: 1 }),
          R.tagMap({ TagMapId: 3, TagId: 5, NoteId: 3, Position: 2 }),
        ],
      },
    },
  ],

  userMarkConflict: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      lastModified: '2026-01-01T00:00:00Z',
      rows: {
        Location: [R.bibleLoc(1, 1, 1)],
        UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-x', ColorIndex: 1 })],
        BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 1 }), R.blockRange({ BlockRangeId: 2, UserMarkId: 1, Identifier: 2 })],
      },
    },
    {
      deviceName: 'iPad',
      lastModified: '2026-05-01T00:00:00Z',
      rows: {
        Location: [R.bibleLoc(1, 1, 1)],
        UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-x', ColorIndex: 3 })],
        BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 7 })],
      },
    },
  ],

  playlistWithMedia: (): FixtureSpec[] => [
    {
      deviceName: 'DESKTOP-TEST',
      grdbMigration: 'v14',
      v16Triggers: false,
      rows: {
        Location: [R.mediaLoc(1, 'pk', 5)],
        IndependentMedia: [
          R.media({ IndependentMediaId: 1, FilePath: PNG1, Hash: 'hash-a' }),
          R.media({ IndependentMediaId: 2, FilePath: MP4_2, Hash: 'hash-b', MimeType: 'video/mp4', OriginalFilename: 'clip.mp4' }),
        ],
        PlaylistItemAccuracy: [R.accuracy(1, 'Accurate'), R.accuracy(2, 'NeedsUserVerification')],
        PlaylistItem: [
          R.playlistItem({ PlaylistItemId: 1, Label: 'Sunset', Accuracy: 1, ThumbnailFilePath: PNG1 }),
          R.playlistItem({ PlaylistItemId: 2, Label: 'Clip', Accuracy: 2, StartTrimOffsetTicks: 0, EndTrimOffsetTicks: 500, EndAction: 1 }),
        ],
        PlaylistItemIndependentMediaMap: [R.piimm(1, 1), R.piimm(2, 2, 123456)],
        PlaylistItemLocationMap: [R.pilm({ PlaylistItemId: 2, LocationId: 1, BaseDurationTicks: 999 })],
        PlaylistItemMarker: [R.marker({ PlaylistItemMarkerId: 1, PlaylistItemId: 2, StartTimeTicks: 100 })],
        PlaylistItemMarkerBibleVerseMap: [R.verseMap(1, 1001001)],
        PlaylistItemMarkerParagraphMap: [R.paragraphMap(1, 555, 3)],
        Tag: [R.playlistTag(1, 'Powerful images')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, PlaylistItemId: 1, Position: 0 }), R.tagMap({ TagMapId: 2, TagId: 1, PlaylistItemId: 2, Position: 1 })],
      },
      mediaFiles: { [PNG1]: R.bytes('PNG-1'), [MP4_2]: R.bytes('MP4-2') },
    },
    {
      deviceName: 'iPad',
      grdbMigration: 'v16',
      rows: { Location: [R.bibleLoc(1, 1, 1)], Note: [R.note({ NoteId: 1, Guid: 'ipad-note', LocationId: 1, Content: 'hello' })] },
    },
  ],

  playlistItemDuplicate: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      rows: {
        IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'aaaaaaaa-0000-4000-8000-000000000001.png', Hash: 'same-hash' })],
        PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
        PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'Same', Accuracy: 1, ThumbnailFilePath: 'aaaaaaaa-0000-4000-8000-000000000001.png' })],
        PlaylistItemIndependentMediaMap: [R.piimm(1, 1, 777)],
        PlaylistItemMarker: [R.marker({ PlaylistItemMarkerId: 1, PlaylistItemId: 1, StartTimeTicks: 50, Label: 'M' })],
        PlaylistItemMarkerBibleVerseMap: [R.verseMap(1, 42)],
        Tag: [R.playlistTag(1, 'Pics')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, PlaylistItemId: 1, Position: 0 })],
      },
      mediaFiles: { 'aaaaaaaa-0000-4000-8000-000000000001.png': R.bytes('PNG-SAME') },
    },
    {
      deviceName: 'iPad',
      rows: {
        IndependentMedia: [R.media({ IndependentMediaId: 7, FilePath: 'bbbbbbbb-0000-4000-8000-000000000002.png', Hash: 'same-hash' })],
        PlaylistItemAccuracy: [R.accuracy(3, 'Accurate')],
        PlaylistItem: [R.playlistItem({ PlaylistItemId: 9, Label: 'Same', Accuracy: 3, ThumbnailFilePath: 'bbbbbbbb-0000-4000-8000-000000000002.png' })],
        PlaylistItemIndependentMediaMap: [R.piimm(9, 7, 777)],
        PlaylistItemMarker: [R.marker({ PlaylistItemMarkerId: 4, PlaylistItemId: 9, StartTimeTicks: 50, Label: 'M' })],
        PlaylistItemMarkerBibleVerseMap: [R.verseMap(4, 42)],
        Tag: [R.playlistTag(2, 'Pics')],
        TagMap: [R.tagMap({ TagMapId: 5, TagId: 2, PlaylistItemId: 9, Position: 0 })],
      },
      mediaFiles: { 'bbbbbbbb-0000-4000-8000-000000000002.png': R.bytes('PNG-SAME') },
    },
  ],

  mediaFilePathCollision: (): FixtureSpec[] => [
    {
      deviceName: 'iPhone',
      rows: {
        IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'shared.png', Hash: 'hash-1' })],
        PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
        PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'One', Accuracy: 1, ThumbnailFilePath: 'shared.png' })],
        PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
      },
      mediaFiles: { 'shared.png': R.bytes('PNG-ONE') },
    },
    {
      deviceName: 'iPad',
      rows: {
        IndependentMedia: [R.media({ IndependentMediaId: 1, FilePath: 'shared.png', Hash: 'hash-2' })],
        PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
        PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: 'Two', Accuracy: 1, ThumbnailFilePath: 'shared.png' })],
        PlaylistItemIndependentMediaMap: [R.piimm(1, 1)],
      },
      mediaFiles: { 'shared.png': R.bytes('PNG-TWO') },
    },
  ],

  singleIdentity: (): FixtureSpec[] => [{ deviceName: 'iPhone', lastModified: '2026-04-04T04:04:04Z', rows: richRows(), mediaFiles: richMedia() }],

  threeWay: (): FixtureSpec[] => {
    const mk = (device: string, chapters: [number, number], content: string, noteTs: string, label: string, lastModified: string): FixtureSpec => ({
      deviceName: device,
      lastModified,
      rows: {
        Location: [R.bibleLoc(1, 1, chapters[0]), R.bibleLoc(2, 1, chapters[1])],
        Note: [R.note({ NoteId: 1, Guid: 'shared', LocationId: 1, Content: content, LastModified: noteTs })],
        PlaylistItemAccuracy: [R.accuracy(1, 'Accurate')],
        PlaylistItem: [R.playlistItem({ PlaylistItemId: 1, Label: label, Accuracy: 1 })],
        PlaylistItemLocationMap: [R.pilm({ PlaylistItemId: 1, LocationId: 2 })],
        Tag: [R.playlistTag(1, 'Favorites')],
        TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, PlaylistItemId: 1, Position: 0 })],
      },
    });
    return [
      mk('iPhone', [1, 2], 'v1', '2025-01-01T00:00:00Z', 'Item A', '2026-01-01T00:00:00Z'),
      mk('iPad', [2, 3], 'v2', '2025-06-01T00:00:00Z', 'Item B', '2026-01-02T00:00:00Z'),
      mk('DESKTOP', [3, 4], 'v3', '2025-03-01T00:00:00Z', 'Item C', '2026-01-03T00:00:00Z'),
    ];
  },
};

// ---------------------------------------------------------------------------
// Scenario assertions
// ---------------------------------------------------------------------------

describe('scenario 1 — non-overlapping union', () => {
  it('unions every table with zero conflicts and zero auto-resolutions', async () => {
    const run = await runMerge(S.nonOverlappingUnion());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts).toEqual(sumCounts(run.analysis.sourceCounts));
    expect(run.analysis.auto).toEqual(emptyAutoSummary());
    expect(run.analysis.warnings).toEqual([]);
    await assertAllInvariants(run);
  });
});

describe('scenario 2 — exact duplicate', () => {
  it('collapses identical backups to one copy of everything', async () => {
    const run = await runMerge(S.exactDuplicate());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts).toEqual(run.analysis.sourceCounts[0]);
    const a = run.analysis.auto;
    expect(a.locationsDeduped).toBe(4);
    expect(a.userMarksDeduped).toBe(1);
    expect(a.blockRangesDeduped).toBe(2);
    expect(a.notesDeduped).toBe(2);
    expect(a.bookmarksDeduped).toBe(1);
    expect(a.inputFieldsDeduped).toBe(1);
    expect(a.mediaDeduped).toBe(1);
    expect(a.tagsMerged).toBe(1);
    expect(a.playlistsMergedByName).toBe(1);
    expect(a.playlistItemsDeduped).toBe(1);
    expect(a.tagMapsDeduped).toBe(3);
    expect(a.bookmarksRenumbered).toBe(0);
    expect(a.tagPositionsRenumbered).toBe(0);
    expect(a.mediaRenamed).toBe(0);
    expect(run.zipEntries.filter((e) => e === PNG1)).toHaveLength(1);
    await assertAllInvariants(run);
  });
});

describe('scenario 3 — note conflict (real-world shaped)', () => {
  it('surfaces one conflict, suggests the later edit, and honours an override', async () => {
    const run = await runMerge(S.noteConflict());
    expect(run.analysis.conflicts).toHaveLength(1);
    const c = run.analysis.conflicts[0];
    expect(c.kind).toBe('note');
    expect(c.candidates).toHaveLength(2);
    expect(c.suggestedWinnerIndex).toBe(1);
    expect(c.candidates[1].timestampSource).toBe('row');
    expect(c.suggestedWinnerReason).toContain('iPad');
    expect(c.context).toContain('nwtsty');
    expect(run.result.counts.Note).toBe(1);
    expect(run.result.counts.Location).toBe(1);
    expect(run.result.tables.Note[0].Content).toBe('How possible? \nMany reasons, but the Bible summed it all up');
    expect(run.result.resolvedConflicts[0]).toMatchObject({ conflictId: c.id, winnerSourceIndex: 1, wasSuggested: true });
    await assertAllInvariants(run);

    const overridden = await runMerge(S.noteConflict(), new Map([[c.id, 0]]));
    expect(overridden.result.tables.Note[0].Content).toBe('Many reasons, but the Bible summed it all up');
    expect(overridden.result.resolvedConflicts[0]).toMatchObject({ winnerSourceIndex: 0, wasSuggested: false });
    const db = await openResultDb(overridden);
    try {
      expect(queryScalar<string>(db, 'SELECT Content FROM Note')).toBe('Many reasons, but the Bible summed it all up');
    } finally {
      db.close();
    }
    await assertAllInvariants(overridden);
  });
});

describe('scenario 4 — input field conflict', () => {
  it('falls back to the backup-level timestamp because InputField has none', async () => {
    const run = await runMerge(S.inputFieldConflict());
    expect(run.analysis.conflicts).toHaveLength(1);
    const c = run.analysis.conflicts[0];
    expect(c.kind).toBe('inputField');
    expect(c.suggestedWinnerIndex).toBe(1);
    expect(c.candidates.every((k) => k.timestampSource === 'backup')).toBe(true);
    expect(c.suggestedWinnerReason).toMatch(/no per-row timestamp/);
    expect(c.context).toContain('q1');
    expect(run.result.tables.InputField).toHaveLength(1);
    expect(run.result.tables.InputField[0].Value).toBe('second answer');
    await assertAllInvariants(run);

    const overridden = await runMerge(S.inputFieldConflict(), new Map([[c.id, 0]]));
    expect(overridden.result.tables.InputField[0].Value).toBe('first answer');
    await assertAllInvariants(overridden);
  });
});

describe('scenario 5 — bookmark slot collision', () => {
  it('keeps both bookmarks and renumbers the second slot without violating UNIQUE', async () => {
    const run = await runMerge(S.bookmarkSlotCollision());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts.Bookmark).toBe(2);
    expect(run.result.counts.Location).toBe(3);
    expect(run.analysis.auto.bookmarksRenumbered).toBe(1);
    expect(run.analysis.auto.bookmarksDeduped).toBe(0);
    const db = await openResultDb(run);
    try {
      const bm = rows<{ Title: string; Slot: number; PublicationLocationId: number }>(db, 'SELECT Title, Slot, PublicationLocationId FROM Bookmark ORDER BY Slot');
      expect(bm.map((b) => b.Slot)).toEqual([0, 1]);
      expect(bm.map((b) => b.Title)).toEqual(['Genesis 1', 'Genesis 2']);
      expect(new Set(bm.map((b) => b.PublicationLocationId)).size).toBe(1);
    } finally {
      db.close();
    }
    await assertAllInvariants(run);
  });
});

describe('scenario 6 — tag position collision', () => {
  it('renumbers contiguously, preserves source-relative order, dedupes the shared note', async () => {
    const run = await runMerge(S.tagPositionCollision());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts.Tag).toBe(1);
    expect(run.result.counts.Note).toBe(4);
    expect(run.result.counts.TagMap).toBe(4);
    expect(run.analysis.auto.tagsMerged).toBe(1);
    expect(run.analysis.auto.tagMapsDeduped).toBe(1);
    expect(run.analysis.auto.tagPositionsRenumbered).toBe(2);
    const db = await openResultDb(run);
    try {
      const order = rows<{ Guid: string; Position: number }>(db, 'SELECT n.Guid, tm.Position FROM TagMap tm JOIN Note n ON n.NoteId = tm.NoteId ORDER BY tm.Position');
      expect(order).toEqual([
        { Guid: 'n1', Position: 0 },
        { Guid: 'n2', Position: 1 },
        { Guid: 'n3', Position: 2 },
        { Guid: 'n4', Position: 3 },
      ]);
    } finally {
      db.close();
    }
    await assertAllInvariants(run);
  });
});

describe('scenario 7 — highlight (UserMark) conflict', () => {
  it('carries BlockRange children only from the winning side', async () => {
    const run = await runMerge(S.userMarkConflict());
    expect(run.analysis.conflicts).toHaveLength(1);
    const c = run.analysis.conflicts[0];
    expect(c.kind).toBe('userMark');
    expect(c.suggestedWinnerIndex).toBe(1);
    expect(c.candidates[0].children).toHaveLength(2);
    expect(c.candidates[1].children).toHaveLength(1);
    expect(run.result.counts.UserMark).toBe(1);
    expect(run.result.counts.BlockRange).toBe(1);
    expect(run.result.tables.UserMark[0].ColorIndex).toBe(3);
    expect(run.result.tables.BlockRange[0].Identifier).toBe(7);
    // Winner has fewer ranges than the largest source: soft warning, still a pass.
    expect(run.archive.validation.warnings.some((w) => w.startsWith('BlockRange'))).toBe(true);
    await assertAllInvariants(run);

    const overridden = await runMerge(S.userMarkConflict(), new Map([[c.id, 0]]));
    expect(overridden.result.tables.UserMark[0].ColorIndex).toBe(1);
    expect(overridden.result.tables.BlockRange.map((b) => b.Identifier).sort()).toEqual([1, 2]);
    expect(overridden.archive.validation.warnings).toEqual([]);
    await assertAllInvariants(overridden);
  });
});

describe('scenario 8 — playlist with custom media vs a media-less backup', () => {
  it('carries playlists, children and embedded files forward; picks the v16 DDL template', async () => {
    const run = await runMerge(S.playlistWithMedia());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts).toEqual(sumCounts(run.analysis.sourceCounts));
    expect(run.zipEntries).toContain(PNG1);
    expect(run.zipEntries).toContain(MP4_2);
    expect(Array.from(run.analysis.mediaFiles.get(PNG1)!)).toEqual(Array.from(R.bytes('PNG-1')));
    expect(run.result.tables.PlaylistItem.find((p) => p.Label === 'Sunset')!.ThumbnailFilePath).toBe(PNG1);
    // Template = highest grdb_migrations (iPad v16 > Desktop v14) → InputField triggers present in the output.
    expect(run.analysis.templateSourceIndex).toBe(1);
    expect(run.analysis.grdbMigrationIdentifier).toBe('v16');
    expect(run.analysis.warnings.some((w) => /migration/.test(w))).toBe(true);
    const db = await openResultDb(run);
    try {
      expect(queryScalar<number>(db, "SELECT count(*) FROM sqlite_master WHERE type='trigger'")).toBe(29);
      expect(queryScalar<number>(db, "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE '%InputField'")).toBe(3);
      expect(queryScalar<number>(db, 'SELECT count(*) FROM PlaylistItemMarkerBibleVerseMap')).toBe(1);
    } finally {
      db.close();
    }
    await assertAllInvariants(run);
  });
});

describe('scenario 9 — structurally identical playlist item on two devices', () => {
  it('dedupes to one item with media included once despite different local ids / file names', async () => {
    const run = await runMerge(S.playlistItemDuplicate());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts.PlaylistItem).toBe(1);
    expect(run.result.counts.IndependentMedia).toBe(1);
    expect(run.result.counts.PlaylistItemIndependentMediaMap).toBe(1);
    expect(run.result.counts.PlaylistItemMarker).toBe(1);
    expect(run.result.counts.PlaylistItemMarkerBibleVerseMap).toBe(1);
    expect(run.result.counts.Tag).toBe(1);
    expect(run.result.counts.TagMap).toBe(1);
    expect(run.analysis.auto).toMatchObject({ playlistItemsDeduped: 1, mediaDeduped: 1, playlistsMergedByName: 1, tagMapsDeduped: 1 });
    const mediaEntries = run.zipEntries.filter((e) => e.endsWith('.png') && e !== 'default_thumbnail.png');
    expect(mediaEntries).toEqual(['aaaaaaaa-0000-4000-8000-000000000001.png']);
    expect(run.result.tables.PlaylistItem[0].ThumbnailFilePath).toBe('aaaaaaaa-0000-4000-8000-000000000001.png');
    await assertAllInvariants(run);
  });
});

describe('scenario 10 — media FilePath collision with different content', () => {
  it('auto-renames one file, keeps both, and every referencing FK still resolves', async () => {
    const run = await runMerge(S.mediaFilePathCollision());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.result.counts.IndependentMedia).toBe(2);
    expect(run.analysis.auto.mediaRenamed).toBe(1);
    const media = run.result.tables.IndependentMedia;
    const one = media.find((m) => m.Hash === 'hash-1')!;
    const two = media.find((m) => m.Hash === 'hash-2')!;
    expect(one.FilePath).toBe('shared.png');
    expect(two.FilePath).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/);
    expect(run.zipEntries).toContain(one.FilePath);
    expect(run.zipEntries).toContain(two.FilePath);
    expect(Array.from(run.analysis.mediaFiles.get(one.FilePath)!)).toEqual(Array.from(R.bytes('PNG-ONE')));
    expect(Array.from(run.analysis.mediaFiles.get(two.FilePath)!)).toEqual(Array.from(R.bytes('PNG-TWO')));
    expect(run.result.tables.PlaylistItem.find((p) => p.Label === 'Two')!.ThumbnailFilePath).toBe(two.FilePath);
    expect(run.result.tables.PlaylistItem.find((p) => p.Label === 'One')!.ThumbnailFilePath).toBe('shared.png');
    await assertAllInvariants(run);
  });
});

describe('scenario 11 — single backup (identity merge)', () => {
  it('reproduces the source exactly with a faithful, self-hashed manifest', async () => {
    const run = await runMerge(S.singleIdentity());
    expect(run.analysis.conflicts).toEqual([]);
    expect(run.analysis.auto).toEqual(emptyAutoSummary());
    expect(run.result.counts).toEqual(run.analysis.sourceCounts[0]);
    for (const t of DATA_TABLE_NAMES) expect(run.result.counts[t]).toBe(run.sources[0].counts[t]);
    const m = run.archive.manifest;
    expect(m.userDataBackup.schemaVersion).toBe(16);
    expect(m.userDataBackup.deviceName).toBe('Merged (1 backup)');
    expect(m.userDataBackup.databaseName).toBe('userData.db');
    expect(m.userDataBackup.hash).toBe(run.archive.dbHash);
    expect(m.userDataBackup.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(run.archive.lastModified).toBe('2026-09-06T15:00:00Z');
    expect(m.userDataBackup.lastModifiedDate).toBe('2026-09-06T15:00:00+00:00');
    expect(m.name).toBe(run.archive.fileName);
    expect(run.archive.fileName).toBe(`UserdataBackup_${FIXED_NOW.getFullYear()}-${String(FIXED_NOW.getMonth() + 1).padStart(2, '0')}-${String(FIXED_NOW.getDate()).padStart(2, '0')}_Merged.jwlibrary`);
    expect(run.zipEntries).toContain('default_thumbnail.png');
    await assertAllInvariants(run);
  });
});

describe('scenario 12 — three backups', () => {
  it('produces 3-candidate conflicts, merges the playlist by name across all three, and adds up', async () => {
    const run = await runMerge(S.threeWay());
    expect(run.analysis.conflicts).toHaveLength(1);
    const c = run.analysis.conflicts[0];
    expect(c.candidates.map((k) => k.sourceLabel)).toEqual(['iPhone', 'iPad', 'DESKTOP']);
    expect(c.suggestedWinnerIndex).toBe(1);
    expect(run.result.tables.Note[0].Content).toBe('v2');
    expect(run.result.counts.Note).toBe(1);
    expect(run.result.counts.Location).toBe(4);
    expect(run.result.counts.Tag).toBe(1);
    expect(run.analysis.auto.playlistsMergedByName).toBe(2);
    expect(run.result.counts.PlaylistItem).toBe(3);
    expect(run.result.counts.PlaylistItemAccuracy).toBe(1);
    expect(run.result.counts.TagMap).toBe(3);
    expect(run.result.tables.TagMap.map((t) => t.Position).sort()).toEqual([0, 1, 2]);
    expect(run.analysis.auto.locationsDeduped).toBe(2);
    await assertAllInvariants(run);

    const overridden = await runMerge(S.threeWay(), new Map([[c.id, 2]]));
    expect(overridden.result.tables.Note[0].Content).toBe('v3');
    await assertAllInvariants(overridden);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants over every scenario
// ---------------------------------------------------------------------------

describe('cross-cutting invariants', () => {
  for (const [name, build] of Object.entries(S)) {
    it(`${name}: analyze() is deterministic`, async () => {
      await assertDeterminism(build());
    });
    it(`${name}: merge is idempotent`, async () => {
      await assertIdempotency(build());
    });
  }
});
