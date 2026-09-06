/**
 * Timestamp helpers. Real backups mix several ISO-8601 shapes
 * ("2024-01-02T03:04:05Z", "…05.123Z", "…05+00:00"), so comparisons parse instead of
 * comparing strings.
 */

/**
 * Normalise the timestamp shapes found in real backups to strict ISO 8601 so that every engine
 * (Safari's Date.parse is strict) agrees: "2026-03-15T11:02:40-0400" → "…-04:00",
 * "…09.0048787-04:00" → "…09.004-04:00", "2024-01-02 03:04:05" → "2024-01-02T03:04:05".
 */
export function normalizeTimestamp(value: string): string {
  let s = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  s = s.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$|$)/, '$1');
  s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return s;
}

/** Epoch millis for an ISO-ish timestamp, or NaN when unparseable. */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return NaN;
  const t = Date.parse(normalizeTimestamp(value));
  if (!Number.isNaN(t)) return t;
  return Date.parse(value);
}

/**
 * Compare two timestamps; returns >0 if a is later, <0 if b is later, 0 if equal/unknown.
 * Unparseable values compare as older than parseable ones; two unparseable compare lexically.
 */
export function compareTimestamps(a: string | null | undefined, b: string | null | undefined): number {
  const ta = parseTimestamp(a);
  const tb = parseTimestamp(b);
  const aOk = !Number.isNaN(ta);
  const bOk = !Number.isNaN(tb);
  if (aOk && bOk) return ta === tb ? 0 : ta > tb ? 1 : -1;
  if (aOk) return 1;
  if (bOk) return -1;
  const sa = a ?? '';
  const sb = b ?? '';
  return sa === sb ? 0 : sa > sb ? 1 : -1;
}

export function maxTimestamp(values: (string | null | undefined)[]): string {
  let best: string | null | undefined = undefined;
  for (const v of values) {
    if (!v) continue;
    if (best === undefined || compareTimestamps(v, best) > 0) best = v;
  }
  return best ?? '';
}

/** "2026-07-10T22:56:20Z" — the shape SQLite's strftime('%Y-%m-%dT%H:%M:%SZ','now') produces. */
export function formatSqliteUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Real manifests write lastModifiedDate as "2026-07-10T22:56:20+00:00"; convert a trailing Z form to that. */
export function toManifestUtcOffsetFormat(value: string): string {
  if (!value) return value;
  if (/Z$/.test(value)) return value.replace(/Z$/, '+00:00');
  return value;
}

/** Local-time ISO with numeric offset and 7 fractional digits, e.g. "2026-09-06T10:58:09.0048787-04:00" (mimics real files). */
export function formatIsoWithLocalOffset(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  const fraction = pad(date.getMilliseconds(), 3) + '0000';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${fraction}${offset}`
  );
}
