/**
 * Terse row factories for synthetic fixtures. Defaults satisfy every CHECK constraint of the real schema
 * so a fixture spec only needs to state what matters for the scenario. All content is invented.
 */
import type {
  BlockRangeRow,
  BookmarkRow,
  IndependentMediaRow,
  InputFieldRow,
  LocationRow,
  NoteRow,
  PlaylistItemAccuracyRow,
  PlaylistItemIndependentMediaMapRow,
  PlaylistItemLocationMapRow,
  PlaylistItemMarkerBibleVerseMapRow,
  PlaylistItemMarkerParagraphMapRow,
  PlaylistItemMarkerRow,
  PlaylistItemRow,
  TagMapRow,
  TagRow,
  UserMarkRow,
} from '../../src/core/jwlibrary/types';

type With<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export const loc = (o: With<LocationRow, 'LocationId'>): LocationRow => ({
  BookNumber: null,
  ChapterNumber: null,
  DocumentId: null,
  Track: null,
  IssueTagNumber: 0,
  KeySymbol: null,
  MepsLanguage: 0,
  Type: 0,
  // Real backups store a single space for "no title" (iOS occasionally NULL — covered by its own test).
  Title: ' ',
  Specialty: null,
  Edition: null,
  ...o,
});

/** Bible chapter location (Type 0; table-level UNIQUE is live). */
export const bibleLoc = (id: number, book: number, chapter: number, extra: Partial<LocationRow> = {}): LocationRow =>
  loc({ LocationId: id, BookNumber: book, ChapterNumber: chapter, KeySymbol: 'nwtsty', MepsLanguage: 0, Type: 0, ...extra });

/** Publication document location (Type 0, DocumentId set, Track NULL — neither SQLite constraint fires). */
export const docLoc = (id: number, documentId: number, keySymbol = 'w', extra: Partial<LocationRow> = {}): LocationRow =>
  loc({ LocationId: id, DocumentId: documentId, KeySymbol: keySymbol, MepsLanguage: 0, Type: 0, ...extra });

/** Publication-level location (Type 1) — the usual `Bookmark.PublicationLocationId` target. */
export const pubLoc = (id: number, keySymbol: string, extra: Partial<LocationRow> = {}): LocationRow =>
  loc({ LocationId: id, KeySymbol: keySymbol, MepsLanguage: 0, Type: 1, ...extra });

/** Media location (Type 2 video / 3 audio) with a Track. */
export const mediaLoc = (id: number, keySymbol: string, track: number, type: 2 | 3 = 2, extra: Partial<LocationRow> = {}): LocationRow =>
  loc({ LocationId: id, KeySymbol: keySymbol, Track: track, MepsLanguage: 0, Type: type, ...extra });

export const userMark = (o: With<UserMarkRow, 'UserMarkId' | 'LocationId' | 'UserMarkGuid'>): UserMarkRow => ({
  ColorIndex: 1,
  StyleIndex: 0,
  Version: 1,
  ...o,
});

export const blockRange = (o: With<BlockRangeRow, 'BlockRangeId' | 'UserMarkId' | 'Identifier'>): BlockRangeRow => ({
  BlockType: 1,
  StartToken: 0,
  EndToken: 5,
  ...o,
});

export const note = (o: With<NoteRow, 'NoteId' | 'Guid'>): NoteRow => ({
  UserMarkId: null,
  LocationId: null,
  Title: null,
  Content: null,
  LastModified: '2024-01-01T00:00:00Z',
  Created: '2024-01-01T00:00:00Z',
  BlockType: 0,
  BlockIdentifier: null,
  ...o,
});

export const bookmark = (o: With<BookmarkRow, 'BookmarkId' | 'LocationId' | 'PublicationLocationId' | 'Slot'>): BookmarkRow => ({
  Title: `Bookmark ${o.BookmarkId}`,
  Snippet: null,
  BlockType: 0,
  BlockIdentifier: null,
  ...o,
});

export const inputField = (LocationId: number, TextTag: string, Value: string): InputFieldRow => ({ LocationId, TextTag, Value });

export const media = (o: With<IndependentMediaRow, 'IndependentMediaId' | 'FilePath' | 'Hash'>): IndependentMediaRow => ({
  OriginalFilename: 'image.png',
  MimeType: 'image/png',
  ...o,
});

export const tag = (TagId: number, Type: number, Name: string): TagRow => ({ TagId, Type, Name });
export const playlistTag = (TagId: number, Name: string): TagRow => tag(TagId, 2, Name);

export const tagMap = (o: With<TagMapRow, 'TagMapId' | 'TagId' | 'Position'>): TagMapRow => ({
  PlaylistItemId: null,
  LocationId: null,
  NoteId: null,
  ...o,
});

export const accuracy = (PlaylistItemAccuracyId: number, Description: string): PlaylistItemAccuracyRow => ({ PlaylistItemAccuracyId, Description });

export const playlistItem = (o: With<PlaylistItemRow, 'PlaylistItemId' | 'Label' | 'Accuracy'>): PlaylistItemRow => ({
  StartTrimOffsetTicks: null,
  EndTrimOffsetTicks: null,
  EndAction: 0,
  ThumbnailFilePath: null,
  ...o,
});

export const pilm = (o: With<PlaylistItemLocationMapRow, 'PlaylistItemId' | 'LocationId'>): PlaylistItemLocationMapRow => ({
  MajorMultimediaType: 2,
  BaseDurationTicks: null,
  ...o,
});

export const piimm = (PlaylistItemId: number, IndependentMediaId: number, DurationTicks = 50_000_000): PlaylistItemIndependentMediaMapRow => ({
  PlaylistItemId,
  IndependentMediaId,
  DurationTicks,
});

export const marker = (o: With<PlaylistItemMarkerRow, 'PlaylistItemMarkerId' | 'PlaylistItemId' | 'StartTimeTicks'>): PlaylistItemMarkerRow => ({
  Label: `Marker ${o.PlaylistItemMarkerId}`,
  DurationTicks: 10_000_000,
  EndTransitionDurationTicks: 0,
  ...o,
});

export const verseMap = (PlaylistItemMarkerId: number, VerseId: number): PlaylistItemMarkerBibleVerseMapRow => ({ PlaylistItemMarkerId, VerseId });

export const paragraphMap = (
  PlaylistItemMarkerId: number,
  MepsDocumentId: number,
  ParagraphIndex: number,
  MarkerIndexWithinParagraph = 0,
): PlaylistItemMarkerParagraphMapRow => ({ PlaylistItemMarkerId, MepsDocumentId, ParagraphIndex, MarkerIndexWithinParagraph });

export const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
