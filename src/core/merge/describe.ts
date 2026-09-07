import type { LocationRow } from '../jwlibrary/types';

/** Short human-readable description of a Location for conflict cards / logs. Never includes user text. */
export function describeLocation(loc: LocationRow | undefined | null): string {
  if (!loc) return 'unknown location';
  const parts: string[] = [];
  const title = loc.Title?.trim();
  if (title) parts.push(title);
  else if (loc.KeySymbol) parts.push(loc.KeySymbol);
  if (loc.BookNumber != null && loc.BookNumber !== 0) {
    parts.push(`book ${loc.BookNumber}` + (loc.ChapterNumber != null && loc.ChapterNumber !== 0 ? ` ch. ${loc.ChapterNumber}` : ''));
  }
  if (loc.DocumentId != null && loc.DocumentId !== 0) parts.push(`doc ${loc.DocumentId}`);
  if (loc.Track != null) parts.push(`track ${loc.Track}`);
  if (loc.IssueTagNumber) parts.push(`issue ${loc.IssueTagNumber}`);
  if (title && loc.KeySymbol) parts.push(`(${loc.KeySymbol})`);
  return parts.length ? parts.join(' · ') : `location #${loc.LocationId}`;
}
