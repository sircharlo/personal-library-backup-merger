import { describe, expect, it } from 'vitest';
import {
  compareTimestamps,
  formatIsoWithLocalOffset,
  formatSqliteUtc,
  maxTimestamp,
  normalizeTimestamp,
  parseTimestamp,
  toManifestUtcOffsetFormat,
} from './datetime';
import { deterministicGuid, newRandomGuid, splitExtension } from './guid';

describe('datetime', () => {
  it('parses the three shapes seen in real backups as the same instant', () => {
    const a = parseTimestamp('2024-01-02T03:04:05Z');
    const b = parseTimestamp('2024-01-02T03:04:05.000Z');
    const c = parseTimestamp('2024-01-02T03:04:05+00:00');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it('normalises the non-strict shapes real devices write (colon-less offsets, 7-digit fractions, space separator)', () => {
    // Safari's Date.parse rejects these unless normalised; V8 tolerates them. Both must agree.
    expect(normalizeTimestamp('2026-03-15T11:02:40-0400')).toBe('2026-03-15T11:02:40-04:00');
    expect(normalizeTimestamp('2026-09-06T10:58:09.0048787-04:00')).toBe('2026-09-06T10:58:09.004-04:00');
    expect(normalizeTimestamp('2026-09-06T10:58:09.0048787Z')).toBe('2026-09-06T10:58:09.004Z');
    expect(normalizeTimestamp('2024-01-02 03:04:05')).toBe('2024-01-02T03:04:05');
    expect(normalizeTimestamp('2024-01-02T03:04:05Z')).toBe('2024-01-02T03:04:05Z');
    expect(parseTimestamp('2026-03-15T11:02:40-0400')).toBe(Date.parse('2026-03-15T15:02:40Z'));
    expect(parseTimestamp('2026-09-06T08:20:18-0400')).toBeGreaterThan(parseTimestamp('2024-01-02T22:47:13Z'));
  });
  it('compares numerically, not lexically, and treats unparseable as older', () => {
    expect(compareTimestamps('2026-01-01T00:00:00Z', '2025-12-31T23:59:59+00:00')).toBeGreaterThan(0);
    expect(compareTimestamps('2024-01-02T10:00:00Z', '2024-01-02T10:00:00.000Z')).toBe(0);
    expect(compareTimestamps('garbage', '2024-01-02T10:00:00Z')).toBeLessThan(0);
    expect(compareTimestamps('', '')).toBe(0);
  });
  it('maxTimestamp picks the latest', () => {
    expect(maxTimestamp(['2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2025-01-01T00:00:00Z'])).toBe('2026-01-01T00:00:00Z');
    expect(maxTimestamp([])).toBe('');
  });
  it('formats like SQLite strftime and like the real manifests', () => {
    expect(formatSqliteUtc(new Date('2026-07-10T22:56:20.123Z'))).toBe('2026-07-10T22:56:20Z');
    expect(toManifestUtcOffsetFormat('2026-07-10T22:56:20Z')).toBe('2026-07-10T22:56:20+00:00');
    expect(formatIsoWithLocalOffset(new Date(2026, 8, 6, 10, 58, 9, 4))).toMatch(/^2026-09-06T10:58:09\.0040000[+-]\d{2}:\d{2}$/);
  });
});

describe('guid', () => {
  it('deterministicGuid is stable, GUID-shaped and seed-sensitive', () => {
    const a = deterministicGuid('seed');
    expect(a).toBe(deterministicGuid('seed'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(deterministicGuid('seed2'));
  });
  it('newRandomGuid is GUID-shaped', () => {
    expect(newRandomGuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('splitExtension keeps the dot and handles extensionless names', () => {
    expect(splitExtension('a.b.png')).toEqual({ base: 'a.b', ext: '.png' });
    expect(splitExtension('a1b2c3d4-0000-4000-8000-000000000002')).toEqual({ base: 'a1b2c3d4-0000-4000-8000-000000000002', ext: '' });
    expect(splitExtension('.hidden')).toEqual({ base: '.hidden', ext: '' });
  });
});
