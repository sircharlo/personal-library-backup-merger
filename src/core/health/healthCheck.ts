/**
 * Orphan / consistency checks over one set of tables (a source backup or the merged result).
 * JW Library writes its database with foreign keys OFF, so leftovers like these do occur.
 * Findings never include note text — only ids and location descriptions.
 */
import type { AllTables, LocationRow } from '../jwlibrary/types';
import { describeLocation } from '../merge/describe';
import { blockRangeSignature } from '../merge/identity';
import { normalizeText } from '../merge/tables/mergeNote';
import { createLogger, fmtMs } from '../util/log';

export type HealthCategory = 'dangling' | 'unreferenced' | 'inconsistent' | 'archive';

/** Clean-ups the merger can apply to the merged output (each maps to one finding). */
export type CleanupKey = 'emptyNotes' | 'rangelessHighlights' | 'duplicateHighlights' | 'unusedMedia' | 'unreferencedLocations';

export interface HealthFinding {
  code: string;
  category: HealthCategory;
  label: string;
  count: number;
  /** Up to a few human-readable examples (ids / location descriptions, never note text). */
  samples: string[];
  /** The clean-up that removes these rows, when one exists. */
  cleanup?: CleanupKey;
  /** Informational only (not necessarily a problem). */
  info?: boolean;
}

export interface HealthReport {
  findings: HealthFinding[];
  checks: number;
  /** Findings with count > 0 that are not merely informational. */
  problemCount: number;
}

const SAMPLE_LIMIT = 8;
const log = createLogger('health');

class Bucket {
  count = 0;
  readonly samples: string[] = [];
  hit(sample: () => string): void {
    this.count++;
    if (this.samples.length < SAMPLE_LIMIT) this.samples.push(sample());
  }
}

export function checkHealth(t: AllTables, mediaFileNames?: Iterable<string>): HealthReport {
  const t0 = performance.now();
  const locById = new Map<number, LocationRow>(t.Location.map((l) => [l.LocationId, l]));
  const noteIds = new Set(t.Note.map((n) => n.NoteId));
  const markIds = new Set(t.UserMark.map((u) => u.UserMarkId));
  const tagIds = new Set(t.Tag.map((g) => g.TagId));
  const itemIds = new Set(t.PlaylistItem.map((p) => p.PlaylistItemId));
  const accuracyIds = new Set(t.PlaylistItemAccuracy.map((a) => a.PlaylistItemAccuracyId));
  const mediaIds = new Set(t.IndependentMedia.map((m) => m.IndependentMediaId));
  const mediaPaths = new Set(t.IndependentMedia.map((m) => m.FilePath));
  const markerIds = new Set(t.PlaylistItemMarker.map((k) => k.PlaylistItemMarkerId));
  const desc = (id: number | null | undefined) => (id == null ? 'no location' : describeLocation(locById.get(id)));

  const findings: HealthFinding[] = [];
  const check = (code: string, category: HealthCategory, label: string, run: (b: Bucket) => void, extra: { cleanup?: CleanupKey; info?: boolean } = {}) => {
    const b = new Bucket();
    run(b);
    findings.push({ code, category, label, count: b.count, samples: b.samples, ...extra });
  };

  // --- A. dangling references -------------------------------------------------
  check('A1', 'dangling', 'notes pointing at a missing location', (b) => {
    for (const n of t.Note) if (n.LocationId != null && !locById.has(n.LocationId)) b.hit(() => `note #${n.NoteId} → location #${n.LocationId}`);
  });
  check('A2', 'dangling', 'notes pointing at a missing highlight', (b) => {
    for (const n of t.Note) if (n.UserMarkId != null && !markIds.has(n.UserMarkId)) b.hit(() => `note #${n.NoteId} → highlight #${n.UserMarkId}`);
  });
  check('A3', 'dangling', 'highlights pointing at a missing location', (b) => {
    for (const u of t.UserMark) if (!locById.has(u.LocationId)) b.hit(() => `highlight #${u.UserMarkId} → location #${u.LocationId}`);
  });
  check('A4', 'dangling', 'highlight ranges pointing at a missing highlight', (b) => {
    for (const r of t.BlockRange) if (!markIds.has(r.UserMarkId)) b.hit(() => `range #${r.BlockRangeId} → highlight #${r.UserMarkId}`);
  });
  check('A5', 'dangling', 'bookmarks pointing at a missing location', (b) => {
    for (const k of t.Bookmark) if (!locById.has(k.LocationId)) b.hit(() => `bookmark #${k.BookmarkId} → location #${k.LocationId}`);
  });
  check('A6', 'dangling', 'bookmarks pointing at a missing publication', (b) => {
    for (const k of t.Bookmark) if (!locById.has(k.PublicationLocationId)) b.hit(() => `bookmark #${k.BookmarkId} → publication location #${k.PublicationLocationId}`);
  });
  check('A7', 'dangling', 'input fields pointing at a missing location', (b) => {
    for (const f of t.InputField) if (!locById.has(f.LocationId)) b.hit(() => `field "${f.TextTag}" → location #${f.LocationId}`);
  });
  check('A8', 'dangling', 'tag assignments pointing at a deleted note', (b) => {
    for (const m of t.TagMap) if (m.NoteId != null && !noteIds.has(m.NoteId)) b.hit(() => `tag assignment #${m.TagMapId} → note #${m.NoteId}`);
  });
  check('A9', 'dangling', 'tag assignments pointing at a missing location', (b) => {
    for (const m of t.TagMap) if (m.LocationId != null && !locById.has(m.LocationId)) b.hit(() => `tag assignment #${m.TagMapId} → location #${m.LocationId}`);
  });
  check('A10', 'dangling', 'tag assignments pointing at a missing playlist item', (b) => {
    for (const m of t.TagMap) if (m.PlaylistItemId != null && !itemIds.has(m.PlaylistItemId)) b.hit(() => `tag assignment #${m.TagMapId} → playlist item #${m.PlaylistItemId}`);
  });
  check('A11', 'dangling', 'tag assignments pointing at a missing tag', (b) => {
    for (const m of t.TagMap) if (!tagIds.has(m.TagId)) b.hit(() => `tag assignment #${m.TagMapId} → tag #${m.TagId}`);
  });
  check('A12', 'dangling', 'playlist items with an unknown accuracy setting', (b) => {
    for (const p of t.PlaylistItem) if (!accuracyIds.has(p.Accuracy)) b.hit(() => `playlist item #${p.PlaylistItemId} → accuracy #${p.Accuracy}`);
  });
  check('A13', 'dangling', 'playlist items whose thumbnail has no media record', (b) => {
    for (const p of t.PlaylistItem) if (p.ThumbnailFilePath != null && !mediaPaths.has(p.ThumbnailFilePath)) b.hit(() => `playlist item #${p.PlaylistItemId} → ${p.ThumbnailFilePath}`);
  });
  check('A14', 'dangling', 'playlist links pointing at a missing playlist item', (b) => {
    for (const x of t.PlaylistItemLocationMap) if (!itemIds.has(x.PlaylistItemId)) b.hit(() => `location link → playlist item #${x.PlaylistItemId}`);
    for (const x of t.PlaylistItemIndependentMediaMap) if (!itemIds.has(x.PlaylistItemId)) b.hit(() => `media link → playlist item #${x.PlaylistItemId}`);
    for (const k of t.PlaylistItemMarker) if (!itemIds.has(k.PlaylistItemId)) b.hit(() => `marker #${k.PlaylistItemMarkerId} → playlist item #${k.PlaylistItemId}`);
  });
  check('A15', 'dangling', 'playlist links pointing at a missing location', (b) => {
    for (const x of t.PlaylistItemLocationMap) if (!locById.has(x.LocationId)) b.hit(() => `playlist item #${x.PlaylistItemId} → location #${x.LocationId}`);
  });
  check('A16', 'dangling', 'playlist links pointing at a missing media record', (b) => {
    for (const x of t.PlaylistItemIndependentMediaMap) if (!mediaIds.has(x.IndependentMediaId)) b.hit(() => `playlist item #${x.PlaylistItemId} → media #${x.IndependentMediaId}`);
  });
  check('A17', 'dangling', 'marker details pointing at a missing marker', (b) => {
    for (const v of t.PlaylistItemMarkerBibleVerseMap) if (!markerIds.has(v.PlaylistItemMarkerId)) b.hit(() => `verse link → marker #${v.PlaylistItemMarkerId}`);
    for (const v of t.PlaylistItemMarkerParagraphMap) if (!markerIds.has(v.PlaylistItemMarkerId)) b.hit(() => `paragraph link → marker #${v.PlaylistItemMarkerId}`);
  });

  // --- B. unreferenced rows ---------------------------------------------------
  const referencedLocations = new Set<number>();
  for (const n of t.Note) if (n.LocationId != null) referencedLocations.add(n.LocationId);
  for (const u of t.UserMark) referencedLocations.add(u.LocationId);
  for (const k of t.Bookmark) {
    referencedLocations.add(k.LocationId);
    referencedLocations.add(k.PublicationLocationId);
  }
  for (const f of t.InputField) referencedLocations.add(f.LocationId);
  for (const m of t.TagMap) if (m.LocationId != null) referencedLocations.add(m.LocationId);
  for (const x of t.PlaylistItemLocationMap) referencedLocations.add(x.LocationId);
  check(
    'B1',
    'unreferenced',
    'locations referenced by nothing',
    (b) => {
      for (const l of t.Location) if (!referencedLocations.has(l.LocationId)) b.hit(() => `#${l.LocationId} ${describeLocation(l)}`);
    },
    { cleanup: 'unreferencedLocations' },
  );

  const rangesByMark = new Map<number, string[]>();
  for (const r of t.BlockRange) {
    const list = rangesByMark.get(r.UserMarkId);
    if (list) list.push(blockRangeSignature(r));
    else rangesByMark.set(r.UserMarkId, [blockRangeSignature(r)]);
  }
  check(
    'B2',
    'unreferenced',
    'highlights with no highlighted range (invisible)',
    (b) => {
      for (const u of t.UserMark) if (!rangesByMark.has(u.UserMarkId)) b.hit(() => `highlight #${u.UserMarkId} at ${desc(u.LocationId)}`);
    },
    { cleanup: 'rangelessHighlights' },
  );

  const assignedTags = new Set(t.TagMap.map((m) => m.TagId));
  check(
    'B3',
    'unreferenced',
    'tags or playlists with no items',
    (b) => {
      for (const g of t.Tag) if (!assignedTags.has(g.TagId)) b.hit(() => `${g.Type === 2 ? 'playlist' : 'tag'} "${g.Name}"`);
    },
    { info: true },
  );

  const usedMediaIds = new Set(t.PlaylistItemIndependentMediaMap.map((x) => x.IndependentMediaId));
  const usedThumbnails = new Set(t.PlaylistItem.map((p) => p.ThumbnailFilePath).filter((p): p is string => p != null));
  check(
    'B4',
    'unreferenced',
    'media files used by no playlist item',
    (b) => {
      for (const m of t.IndependentMedia) if (!usedMediaIds.has(m.IndependentMediaId) && !usedThumbnails.has(m.FilePath)) b.hit(() => `${m.OriginalFilename} (${m.FilePath})`);
    },
    { cleanup: 'unusedMedia' },
  );

  const itemsInPlaylists = new Set(t.TagMap.map((m) => m.PlaylistItemId).filter((p): p is number => p != null));
  check(
    'B5',
    'unreferenced',
    'playlist items that are in no playlist',
    (b) => {
      for (const p of t.PlaylistItem) if (!itemsInPlaylists.has(p.PlaylistItemId)) b.hit(() => `playlist item #${p.PlaylistItemId} "${p.Label}"`);
    },
    { info: true },
  );
  const itemsWithLocation = new Set(t.PlaylistItemLocationMap.map((x) => x.PlaylistItemId));
  const itemsWithMedia = new Set(t.PlaylistItemIndependentMediaMap.map((x) => x.PlaylistItemId));
  check(
    'B6',
    'unreferenced',
    'playlist items with no content',
    (b) => {
      for (const p of t.PlaylistItem) if (!itemsWithLocation.has(p.PlaylistItemId) && !itemsWithMedia.has(p.PlaylistItemId)) b.hit(() => `playlist item #${p.PlaylistItemId} "${p.Label}"`);
    },
    { info: true },
  );
  check(
    'B7',
    'unreferenced',
    'standalone notes (attached to no location or highlight)',
    (b) => {
      for (const n of t.Note) if (n.LocationId == null && n.UserMarkId == null) b.hit(() => `note #${n.NoteId}`);
    },
    { info: true },
  );
  // An empty note that carries a tag is a deliberate marker (a tag used as a bookmark), not junk.
  const taggedNotes = new Set(t.TagMap.map((m) => m.NoteId).filter((id): id is number => id != null));
  check(
    'B8',
    'unreferenced',
    'notes with no title, no content and no tag',
    (b) => {
      for (const n of t.Note) {
        if (isEmptyNote(n) && !taggedNotes.has(n.NoteId)) b.hit(() => `note #${n.NoteId} at ${desc(n.LocationId)}`);
      }
    },
    { cleanup: 'emptyNotes' },
  );

  // --- C. inconsistencies -----------------------------------------------------
  const markById = new Map(t.UserMark.map((u) => [u.UserMarkId, u]));
  check(
    'C1',
    'inconsistent',
    "notes whose location differs from their highlight's location",
    (b) => {
      for (const n of t.Note) {
        if (n.UserMarkId == null || n.LocationId == null) continue;
        const u = markById.get(n.UserMarkId);
        if (u && u.LocationId !== n.LocationId) b.hit(() => `note #${n.NoteId}: ${desc(n.LocationId)} vs highlight at ${desc(u.LocationId)}`);
      }
    },
    { info: true },
  );
  check(
    'C2',
    'inconsistent',
    'bookmarks whose target is in a different publication than recorded',
    (b) => {
      for (const k of t.Bookmark) {
        const target = locById.get(k.LocationId);
        const pub = locById.get(k.PublicationLocationId);
        if (!target || !pub) continue;
        if ((target.KeySymbol ?? '') !== (pub.KeySymbol ?? '') || (target.MepsLanguage ?? -1) !== (pub.MepsLanguage ?? -1)) {
          b.hit(() => `bookmark #${k.BookmarkId}: ${describeLocation(target)} recorded under ${describeLocation(pub)}`);
        }
      }
    },
    { info: true },
  );
  check('C3', 'inconsistent', 'duplicate ranges inside one highlight', (b) => {
    for (const [id, sigs] of rangesByMark) {
      const extra = sigs.length - new Set(sigs).size;
      for (let i = 0; i < extra; i++) b.hit(() => `highlight #${id}`);
    }
  });

  // C4/C5: highlights on the same passage with identical ranges.
  const groups = new Map<string, { locationId: number; marks: { id: number; style: string }[] }>();
  for (const u of t.UserMark) {
    const sigs = rangesByMark.get(u.UserMarkId);
    if (!sigs) continue;
    const key = `${u.LocationId}${[...sigs].sort().join('')}`;
    const g = groups.get(key) ?? { locationId: u.LocationId, marks: [] };
    g.marks.push({ id: u.UserMarkId, style: `${u.ColorIndex}/${u.StyleIndex}` });
    groups.set(key, g);
  }
  check(
    'C4',
    'inconsistent',
    'exact duplicate highlights (same passage, same ranges, same colour)',
    (b) => {
      for (const g of groups.values()) {
        const byStyle = new Map<string, number[]>();
        for (const m of g.marks) byStyle.set(m.style, [...(byStyle.get(m.style) ?? []), m.id]);
        for (const ids of byStyle.values()) for (let i = 1; i < ids.length; i++) b.hit(() => `${desc(g.locationId)} (highlights #${ids.join(', #')})`);
      }
    },
    { cleanup: 'duplicateHighlights' },
  );
  check(
    'C5',
    'inconsistent',
    'overlapping highlights (same passage and ranges, different colour)',
    (b) => {
      for (const g of groups.values()) {
        if (new Set(g.marks.map((m) => m.style)).size < 2) continue;
        for (let i = 1; i < g.marks.length; i++) b.hit(() => `${desc(g.locationId)} (highlights #${g.marks.map((m) => m.id).join(', #')})`);
      }
    },
    { info: true },
  );
  check('C6', 'inconsistent', 'tag assignments with more or fewer than one target', (b) => {
    for (const m of t.TagMap) {
      const targets = (m.NoteId != null ? 1 : 0) + (m.LocationId != null ? 1 : 0) + (m.PlaylistItemId != null ? 1 : 0);
      if (targets !== 1) b.hit(() => `tag assignment #${m.TagMapId}`);
    }
  });

  // --- D. archive -------------------------------------------------------------
  if (mediaFileNames) {
    const files = new Set(mediaFileNames);
    check('D1', 'archive', 'media records whose file is missing from the backup', (b) => {
      for (const m of t.IndependentMedia) if (!files.has(m.FilePath)) b.hit(() => `${m.OriginalFilename} (${m.FilePath})`);
    });
    check('D2', 'archive', 'files in the backup that no media record describes', (b) => {
      for (const f of files) if (!mediaPaths.has(f)) b.hit(() => f);
    });
  }

  const problemCount = findings.filter((f) => f.count > 0 && !f.info).length;
  const nonZero = findings.filter((f) => f.count > 0);
  log.debug(`health: ${findings.length} checks, ${nonZero.length} with findings in ${fmtMs(performance.now() - t0)}`, Object.fromEntries(nonZero.map((f) => [f.code, f.count])));
  return { findings, checks: findings.length, problemCount };
}

export function isEmptyNote(n: { Title: string | null; Content: string | null }): boolean {
  return normalizeText(n.Title) === '' && normalizeText(n.Content) === '';
}

export function findingByCleanup(report: HealthReport | null | undefined, cleanup: CleanupKey): HealthFinding | undefined {
  return report?.findings.find((f) => f.cleanup === cleanup);
}
