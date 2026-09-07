/**
 * Synthetic `.jwlibrary` files for the browser tests, generated with the same builders as the unit
 * suite (invented content only). Written to `e2e/.fixtures/` (gitignored) so Playwright can upload them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtureBytes } from '../tests/fixtures/builders';
import * as R from '../tests/fixtures/rows';

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.fixtures');

export interface E2eFixtures {
  /** Older edit of the shared note, plus one note of its own and one highlight. */
  phone: string;
  /** Newer edit of the shared note (the suggested winner), plus one tagged note of its own. */
  tablet: string;
}

export async function writeFixtures(): Promise<E2eFixtures> {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const phone = await buildFixtureBytes({
    deviceName: 'Phone',
    lastModified: '2026-09-01T10:00:00Z',
    rows: {
      Location: [R.bibleLoc(1, 43, 3), R.bibleLoc(2, 19, 23)],
      Note: [
        R.note({ NoteId: 1, Guid: 'shared-note', LocationId: 1, Title: 'Born again', Content: 'First thoughts on the chapter', LastModified: '2026-08-01T10:00:00Z' }),
        R.note({ NoteId: 2, Guid: 'phone-only', LocationId: 2, Title: 'Shepherd', Content: 'Only on the phone' }),
      ],
      UserMark: [R.userMark({ UserMarkId: 1, LocationId: 1, UserMarkGuid: 'um-phone-1' })],
      BlockRange: [R.blockRange({ BlockRangeId: 1, UserMarkId: 1, Identifier: 3 })],
    },
  });

  const tablet = await buildFixtureBytes({
    deviceName: 'Tablet',
    lastModified: '2026-09-05T10:00:00Z',
    rows: {
      Location: [R.bibleLoc(1, 43, 3), R.bibleLoc(2, 40, 5)],
      Note: [
        R.note({ NoteId: 1, Guid: 'shared-note', LocationId: 1, Title: 'Born again', Content: 'Second thoughts on the chapter, expanded', LastModified: '2026-09-04T10:00:00Z' }),
        R.note({ NoteId: 2, Guid: 'tablet-only', LocationId: 2, Title: 'Sermon', Content: 'Only on the tablet' }),
      ],
      Tag: [R.tag(1, 1, 'Favourites')],
      TagMap: [R.tagMap({ TagMapId: 1, TagId: 1, NoteId: 2, Position: 0 })],
    },
  });

  const out = {
    phone: path.join(FIXTURE_DIR, 'UserdataBackup_2026-09-06_Phone.jwlibrary'),
    tablet: path.join(FIXTURE_DIR, 'UserdataBackup_2026-09-06_Tablet.jwlibrary'),
  };
  fs.writeFileSync(out.phone, phone);
  fs.writeFileSync(out.tablet, tablet);
  return out;
}
