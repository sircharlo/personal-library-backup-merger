/**
 * Row interfaces mirror the real JW Library `userData.db` schema (schemaVersion 16)
 * column names and nullability exactly, as verified via `PRAGMA table_info`.
 */

export interface LocationRow {
  LocationId: number;
  BookNumber: number | null;
  ChapterNumber: number | null;
  DocumentId: number | null;
  Track: number | null;
  IssueTagNumber: number;
  KeySymbol: string | null;
  MepsLanguage: number | null;
  Type: number;
  Title: string | null;
  Specialty: string | null;
  Edition: string | null;
}

export interface UserMarkRow {
  UserMarkId: number;
  ColorIndex: number;
  LocationId: number;
  StyleIndex: number;
  UserMarkGuid: string;
  Version: number;
}

export interface BlockRangeRow {
  BlockRangeId: number;
  BlockType: number;
  Identifier: number;
  StartToken: number | null;
  EndToken: number | null;
  UserMarkId: number;
}

export interface NoteRow {
  NoteId: number;
  Guid: string;
  UserMarkId: number | null;
  LocationId: number | null;
  Title: string | null;
  Content: string | null;
  LastModified: string;
  Created: string;
  BlockType: number;
  BlockIdentifier: number | null;
}

export interface BookmarkRow {
  BookmarkId: number;
  LocationId: number;
  PublicationLocationId: number;
  Slot: number;
  Title: string;
  Snippet: string | null;
  BlockType: number;
  BlockIdentifier: number | null;
}

export interface InputFieldRow {
  LocationId: number;
  TextTag: string;
  Value: string;
}

export interface IndependentMediaRow {
  IndependentMediaId: number;
  OriginalFilename: string;
  FilePath: string;
  MimeType: string;
  Hash: string;
}

export interface TagRow {
  TagId: number;
  Type: number;
  Name: string;
}

export interface TagMapRow {
  TagMapId: number;
  PlaylistItemId: number | null;
  LocationId: number | null;
  NoteId: number | null;
  TagId: number;
  Position: number;
}

export interface PlaylistItemRow {
  PlaylistItemId: number;
  Label: string;
  StartTrimOffsetTicks: number | null;
  EndTrimOffsetTicks: number | null;
  Accuracy: number;
  EndAction: number;
  ThumbnailFilePath: string | null;
}

export interface PlaylistItemAccuracyRow {
  PlaylistItemAccuracyId: number;
  Description: string;
}

export interface PlaylistItemIndependentMediaMapRow {
  PlaylistItemId: number;
  IndependentMediaId: number;
  DurationTicks: number;
}

export interface PlaylistItemLocationMapRow {
  PlaylistItemId: number;
  LocationId: number;
  MajorMultimediaType: number;
  BaseDurationTicks: number | null;
}

export interface PlaylistItemMarkerRow {
  PlaylistItemMarkerId: number;
  PlaylistItemId: number;
  Label: string;
  StartTimeTicks: number;
  DurationTicks: number;
  EndTransitionDurationTicks: number;
}

export interface PlaylistItemMarkerBibleVerseMapRow {
  PlaylistItemMarkerId: number;
  VerseId: number;
}

export interface PlaylistItemMarkerParagraphMapRow {
  PlaylistItemMarkerId: number;
  MepsDocumentId: number;
  ParagraphIndex: number;
  MarkerIndexWithinParagraph: number;
}

export interface AllTables {
  Location: LocationRow[];
  UserMark: UserMarkRow[];
  BlockRange: BlockRangeRow[];
  Note: NoteRow[];
  Bookmark: BookmarkRow[];
  InputField: InputFieldRow[];
  IndependentMedia: IndependentMediaRow[];
  Tag: TagRow[];
  TagMap: TagMapRow[];
  PlaylistItem: PlaylistItemRow[];
  PlaylistItemAccuracy: PlaylistItemAccuracyRow[];
  PlaylistItemIndependentMediaMap: PlaylistItemIndependentMediaMapRow[];
  PlaylistItemLocationMap: PlaylistItemLocationMapRow[];
  PlaylistItemMarker: PlaylistItemMarkerRow[];
  PlaylistItemMarkerBibleVerseMap: PlaylistItemMarkerBibleVerseMapRow[];
  PlaylistItemMarkerParagraphMap: PlaylistItemMarkerParagraphMapRow[];
}

export type DataTableName = keyof AllTables;

/** Every user-data table, in FK-safe insertion order (parents before children). */
export const DATA_TABLE_NAMES: readonly DataTableName[] = [
  'Location',
  'UserMark',
  'IndependentMedia',
  'BlockRange',
  'Note',
  'Bookmark',
  'InputField',
  'Tag',
  'PlaylistItemAccuracy',
  'PlaylistItem',
  'PlaylistItemLocationMap',
  'PlaylistItemIndependentMediaMap',
  'PlaylistItemMarker',
  'PlaylistItemMarkerBibleVerseMap',
  'PlaylistItemMarkerParagraphMap',
  'TagMap',
] as const;

/** Column lists per table, in schema order. Used for reading, validating and inserting. */
export const TABLE_COLUMNS: { readonly [K in DataTableName]: readonly (keyof AllTables[K][number] & string)[] } = {
  Location: ['LocationId', 'BookNumber', 'ChapterNumber', 'DocumentId', 'Track', 'IssueTagNumber', 'KeySymbol', 'MepsLanguage', 'Type', 'Title', 'Specialty', 'Edition'],
  UserMark: ['UserMarkId', 'ColorIndex', 'LocationId', 'StyleIndex', 'UserMarkGuid', 'Version'],
  BlockRange: ['BlockRangeId', 'BlockType', 'Identifier', 'StartToken', 'EndToken', 'UserMarkId'],
  Note: ['NoteId', 'Guid', 'UserMarkId', 'LocationId', 'Title', 'Content', 'LastModified', 'Created', 'BlockType', 'BlockIdentifier'],
  Bookmark: ['BookmarkId', 'LocationId', 'PublicationLocationId', 'Slot', 'Title', 'Snippet', 'BlockType', 'BlockIdentifier'],
  InputField: ['LocationId', 'TextTag', 'Value'],
  IndependentMedia: ['IndependentMediaId', 'OriginalFilename', 'FilePath', 'MimeType', 'Hash'],
  Tag: ['TagId', 'Type', 'Name'],
  TagMap: ['TagMapId', 'PlaylistItemId', 'LocationId', 'NoteId', 'TagId', 'Position'],
  PlaylistItem: ['PlaylistItemId', 'Label', 'StartTrimOffsetTicks', 'EndTrimOffsetTicks', 'Accuracy', 'EndAction', 'ThumbnailFilePath'],
  PlaylistItemAccuracy: ['PlaylistItemAccuracyId', 'Description'],
  PlaylistItemIndependentMediaMap: ['PlaylistItemId', 'IndependentMediaId', 'DurationTicks'],
  PlaylistItemLocationMap: ['PlaylistItemId', 'LocationId', 'MajorMultimediaType', 'BaseDurationTicks'],
  PlaylistItemMarker: ['PlaylistItemMarkerId', 'PlaylistItemId', 'Label', 'StartTimeTicks', 'DurationTicks', 'EndTransitionDurationTicks'],
  PlaylistItemMarkerBibleVerseMap: ['PlaylistItemMarkerId', 'VerseId'],
  PlaylistItemMarkerParagraphMap: ['PlaylistItemMarkerId', 'MepsDocumentId', 'ParagraphIndex', 'MarkerIndexWithinParagraph'],
};

/** Primary-key column(s) per table — used for deterministic read ordering and traceability keys. */
export const TABLE_PRIMARY_KEYS: { readonly [K in DataTableName]: readonly string[] } = {
  Location: ['LocationId'],
  UserMark: ['UserMarkId'],
  BlockRange: ['BlockRangeId'],
  Note: ['NoteId'],
  Bookmark: ['BookmarkId'],
  InputField: ['LocationId', 'TextTag'],
  IndependentMedia: ['IndependentMediaId'],
  Tag: ['TagId'],
  TagMap: ['TagMapId'],
  PlaylistItem: ['PlaylistItemId'],
  PlaylistItemAccuracy: ['PlaylistItemAccuracyId'],
  PlaylistItemIndependentMediaMap: ['PlaylistItemId', 'IndependentMediaId'],
  PlaylistItemLocationMap: ['PlaylistItemId', 'LocationId'],
  PlaylistItemMarker: ['PlaylistItemMarkerId'],
  PlaylistItemMarkerBibleVerseMap: ['PlaylistItemMarkerId', 'VerseId'],
  PlaylistItemMarkerParagraphMap: ['PlaylistItemMarkerId', 'MepsDocumentId', 'ParagraphIndex', 'MarkerIndexWithinParagraph'],
};

/** Non-data bookkeeping tables that must also exist. */
export const SYSTEM_TABLE_NAMES = ['grdb_migrations', 'LastModified'] as const;

export function emptyAllTables(): AllTables {
  return {
    Location: [],
    UserMark: [],
    BlockRange: [],
    Note: [],
    Bookmark: [],
    InputField: [],
    IndependentMedia: [],
    Tag: [],
    TagMap: [],
    PlaylistItem: [],
    PlaylistItemAccuracy: [],
    PlaylistItemIndependentMediaMap: [],
    PlaylistItemLocationMap: [],
    PlaylistItemMarker: [],
    PlaylistItemMarkerBibleVerseMap: [],
    PlaylistItemMarkerParagraphMap: [],
  };
}

export type TableCounts = { [K in DataTableName]: number };

export function countTables(tables: AllTables): TableCounts {
  const out = {} as TableCounts;
  for (const name of DATA_TABLE_NAMES) out[name] = tables[name].length;
  return out;
}

/** `manifest.json` at the root of a `.jwlibrary` zip. */
export interface JwManifest {
  name: string;
  creationDate: string;
  version: number;
  type: number;
  userDataBackup: {
    lastModifiedDate: string;
    deviceName: string;
    databaseName: string;
    hash: string;
    schemaVersion: number;
  };
}

export interface SchemaObject {
  type: 'table' | 'index' | 'trigger' | 'view';
  name: string;
  tblName: string;
  sql: string;
}

export interface SchemaObjects {
  tables: SchemaObject[];
  indexes: SchemaObject[];
  triggers: SchemaObject[];
}

export interface SchemaCheckResult {
  missingTables: string[];
  /** "Table.Column" entries */
  missingColumns: string[];
  ok: boolean;
}

export interface ParsedBackup {
  sourceIndex: number;
  fileName: string;
  deviceName: string;
  manifest: JwManifest;
  schemaVersion: number;
  /** Single row of `grdb_migrations`, e.g. "v16". Empty string if the table is empty. */
  grdbMigrationIdentifier: string;
  /** `PRAGMA user_version` of the source db (real backups carry the schema version here too). */
  userVersion: number;
  schemaObjects: SchemaObjects;
  schemaCheck: SchemaCheckResult;
  tables: AllTables;
  counts: TableCounts;
  /** This source's `LastModified` singleton value. */
  lastModified: string;
  /** Every non-db, non-manifest, non-thumbnail file at the zip root, keyed by file name (= IndependentMedia.FilePath). */
  mediaFiles: Map<string, Uint8Array>;
  defaultThumbnail?: Uint8Array;
}

export const DEFAULT_THUMBNAIL_NAME = 'default_thumbnail.png';
export const MANIFEST_NAME = 'manifest.json';
export const DEFAULT_DATABASE_NAME = 'userData.db';
