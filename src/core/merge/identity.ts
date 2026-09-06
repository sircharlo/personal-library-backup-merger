import {
  TABLE_PRIMARY_KEYS,
  type BlockRangeRow,
  type BookmarkRow,
  type DataTableName,
  type IndependentMediaRow,
  type InputFieldRow,
  type LocationRow,
  type NoteRow,
  type PlaylistItemAccuracyRow,
  type TagRow,
  type UserMarkRow,
} from '../jwlibrary/types';

/** Unit separator — never appears in real user data. */
export const KEY_SEP = '\u001F';
/** Record separator — distinct NULL sentinel so NULL never collides with "" or "null". */
export const NULL_TOKEN = '\u001E';

export type KeyPart = string | number | null | undefined;

export function keyOf(parts: readonly KeyPart[]): string {
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out += KEY_SEP;
    const p = parts[i];
    out += p === null || p === undefined ? NULL_TOKEN : String(p);
  }
  return out;
}

/** Composite local key of a row from its primary-key columns (numbers stay plain for single-int PKs). */
export function localRowKey(table: DataTableName, row: object): number | string {
  const r = row as Record<string, unknown>;
  const pk = TABLE_PRIMARY_KEYS[table];
  if (pk.length === 1) {
    const v = r[pk[0]];
    return typeof v === 'number' ? v : String(v);
  }
  return keyOf(pk.map((c) => r[c] as KeyPart));
}

// ---------------------------------------------------------------------------
// Location — two constraint-mirroring keys plus a full-tuple key.
// ---------------------------------------------------------------------------

/**
 * Mirrors the table-level `UNIQUE(BookNumber, ChapterNumber, KeySymbol, MepsLanguage, Type)`.
 * SQLite NULLs are never equal, so the constraint can only fire when all nullable columns are set.
 */
export function locationTableUniqueKey(r: LocationRow): string | null {
  if (r.BookNumber == null || r.ChapterNumber == null || r.KeySymbol == null || r.MepsLanguage == null) return null;
  return 'T' + KEY_SEP + keyOf([r.BookNumber, r.ChapterNumber, r.KeySymbol, r.MepsLanguage, r.Type]);
}

/**
 * Mirrors `IX_Location_Media` UNIQUE(KeySymbol, IssueTagNumber, MepsLanguage, DocumentId, Track, Type,
 * COALESCE(Specialty,''), COALESCE(Edition,'')). Live only when KeySymbol/MepsLanguage/DocumentId/Track are set.
 */
export function locationMediaUniqueKey(r: LocationRow): string | null {
  if (r.KeySymbol == null || r.MepsLanguage == null || r.DocumentId == null || r.Track == null) return null;
  return (
    'M' +
    KEY_SEP +
    keyOf([r.KeySymbol, r.IssueTagNumber, r.MepsLanguage, r.DocumentId, r.Track, r.Type, r.Specialty ?? '', r.Edition ?? ''])
  );
}

/**
 * Full identity tuple (every column except the id and the display `Title`), with NULL as a value.
 * Needed because the most common real rows — publication documents (Type 0, DocumentId set, Track NULL,
 * BookNumber NULL) — satisfy *neither* SQLite constraint, yet are unmistakably the same location.
 */
export function locationFullTupleKey(r: LocationRow): string {
  return (
    'F' +
    KEY_SEP +
    keyOf([
      r.BookNumber,
      r.ChapterNumber,
      r.DocumentId,
      r.Track,
      r.IssueTagNumber,
      r.KeySymbol,
      r.MepsLanguage,
      r.Type,
      r.Specialty ?? '',
      r.Edition ?? '',
    ])
  );
}

/** All live identity keys of a Location row, most specific (constraint-backed) first. */
export function locationIdentityKeys(r: LocationRow): string[] {
  const keys: string[] = [];
  const t = locationTableUniqueKey(r);
  if (t) keys.push(t);
  const m = locationMediaUniqueKey(r);
  if (m) keys.push(m);
  keys.push(locationFullTupleKey(r));
  return keys;
}

// ---------------------------------------------------------------------------
// Simple natural keys
// ---------------------------------------------------------------------------

export const userMarkKey = (r: UserMarkRow): string => r.UserMarkGuid;
export const noteKey = (r: NoteRow): string => r.Guid;
export const tagKey = (r: TagRow): string => keyOf([r.Type, r.Name]);
export const playlistItemAccuracyKey = (r: PlaylistItemAccuracyRow): string => r.Description;
export const independentMediaKey = (r: IndependentMediaRow): string => r.Hash;

/** InputField identity after Location remap (it is the table's own PK). */
export const inputFieldKey = (mappedLocationId: number, r: Pick<InputFieldRow, 'TextTag'>): string =>
  keyOf([mappedLocationId, r.TextTag]);

/** Bookmark slot key (mirrors UNIQUE(PublicationLocationId, Slot)), post-remap. */
export const bookmarkSlotKey = (mappedPublicationLocationId: number, slot: number): string =>
  keyOf([mappedPublicationLocationId, slot]);

/** What a bookmark points at, post-remap — same target ⇒ true duplicate regardless of slot. */
export const bookmarkTargetKey = (
  mappedPublicationLocationId: number,
  mappedLocationId: number,
  r: Pick<BookmarkRow, 'BlockType' | 'BlockIdentifier'>,
): string => keyOf([mappedPublicationLocationId, mappedLocationId, r.BlockType, r.BlockIdentifier]);

/** BlockRange structural signature (no natural key; used to pair children of deduplicated UserMarks). */
export const blockRangeSignature = (r: BlockRangeRow): string =>
  keyOf([r.BlockType, r.Identifier, r.StartToken, r.EndToken]);

export type TagMapRefKind = 'N' | 'L' | 'P';

/** TagMap identity — mirrors its three UNIQUE constraints, post-remap. */
export const tagMapKey = (mappedTagId: number, refKind: TagMapRefKind, mappedRefId: number): string =>
  keyOf([mappedTagId, refKind, mappedRefId]);
