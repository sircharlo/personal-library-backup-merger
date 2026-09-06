import { describe, expect, it } from 'vitest';
import * as R from '../../../tests/fixtures/rows';
import {
  KEY_SEP,
  NULL_TOKEN,
  keyOf,
  localRowKey,
  locationFullTupleKey,
  locationIdentityKeys,
  locationMediaUniqueKey,
  locationTableUniqueKey,
  tagKey,
} from './identity';

describe('keyOf', () => {
  it('distinguishes NULL from empty string and from "null"', () => {
    expect(keyOf([null])).toBe(NULL_TOKEN);
    expect(keyOf([''])).toBe('');
    expect(keyOf(['null'])).toBe('null');
    expect(new Set([keyOf([null, 1]), keyOf(['', 1]), keyOf(['null', 1])]).size).toBe(3);
  });
  it('uses a delimiter that keeps ["a","b"] apart from ["ab"]', () => {
    expect(keyOf(['a', 'b'])).toBe(`a${KEY_SEP}b`);
    expect(keyOf(['a', 'b'])).not.toBe(keyOf(['ab']));
  });
});

describe('Location identity', () => {
  it('table-level UNIQUE key is live only for Bible rows with all four columns set', () => {
    expect(locationTableUniqueKey(R.bibleLoc(1, 1, 1))).not.toBeNull();
    expect(locationTableUniqueKey(R.docLoc(1, 1001))).toBeNull();
    expect(locationTableUniqueKey(R.bibleLoc(1, 1, 1, { MepsLanguage: null }))).toBeNull();
  });
  it('media UNIQUE index key is live only when KeySymbol/MepsLanguage/DocumentId/Track are all set', () => {
    expect(locationMediaUniqueKey(R.mediaLoc(1, 'pk', 5))).toBeNull(); // DocumentId NULL (as on real devices)
    expect(locationMediaUniqueKey(R.mediaLoc(1, 'pk', 5, 2, { DocumentId: 77 }))).not.toBeNull();
    expect(locationMediaUniqueKey(R.docLoc(1, 1001))).toBeNull(); // Track NULL
  });
  it('media key folds NULL Specialty/Edition to "" like COALESCE does', () => {
    const a = R.mediaLoc(1, 'pk', 5, 2, { DocumentId: 77, Specialty: null });
    const b = R.mediaLoc(2, 'pk', 5, 2, { DocumentId: 77, Specialty: '' });
    expect(locationMediaUniqueKey(a)).toBe(locationMediaUniqueKey(b));
  });
  it('full-tuple key is always live and ignores id and Title', () => {
    const a = R.docLoc(1, 1001, 'w', { Title: 'x' });
    const b = R.docLoc(99, 1001, 'w', { Title: 'y' });
    expect(locationFullTupleKey(a)).toBe(locationFullTupleKey(b));
    expect(locationFullTupleKey(R.docLoc(1, 1001, 'w'))).not.toBe(locationFullTupleKey(R.docLoc(1, 1002, 'w')));
  });
  it('lists constraint-backed keys before the full-tuple key', () => {
    const keys = locationIdentityKeys(R.bibleLoc(1, 1, 1));
    expect(keys).toHaveLength(2);
    expect(keys[0].startsWith('T')).toBe(true);
    expect(keys[1].startsWith('F')).toBe(true);
    expect(locationIdentityKeys(R.docLoc(1, 1001))).toHaveLength(1);
  });
});

describe('misc keys', () => {
  it('tagKey separates Type from Name', () => {
    expect(tagKey(R.tag(1, 1, 'Study'))).not.toBe(tagKey(R.tag(1, 2, 'Study')));
  });
  it('localRowKey handles single and composite primary keys', () => {
    expect(localRowKey('Note', R.note({ NoteId: 7, Guid: 'g' }))).toBe(7);
    expect(localRowKey('InputField', R.inputField(3, 'q1', 'v'))).toBe(keyOf([3, 'q1']));
    expect(localRowKey('PlaylistItemMarkerParagraphMap', R.paragraphMap(1, 2, 3, 4))).toBe(keyOf([1, 2, 3, 4]));
  });
});
