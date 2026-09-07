import { I } from '@/icons';
import type { TableCounts } from '@/core/jwlibrary/types';
import { plural } from './format';

export type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'unknown';

export function deviceKind(name: string | undefined | null): DeviceKind {
  const n = (name ?? '').toLowerCase();
  if (!n) return 'unknown';
  if (/ipad|tablet|\btab\b/.test(n)) return 'tablet';
  if (/iphone|pixel|galaxy|android|phone|mobile/.test(n)) return 'phone';
  if (/desktop|laptop|macbook|imac|\bmac\b|windows|\bpc\b|book|surface/.test(n)) return 'desktop';
  return 'unknown';
}

export function deviceIcon(kind: DeviceKind): string {
  switch (kind) {
    case 'phone':
      return I.mobile;
    case 'tablet':
      return I.tabletMac;
    case 'desktop':
      return I.computer;
    default:
      return I.devices;
  }
}

export interface StatChip {
  icon: string;
  label: string;
  value: number;
}

export function statChips(counts: TableCounts, playlistCount: number, mediaFileCount: number): StatChip[] {
  return [
    { icon: I.stickyNote2, label: plural(counts.Note, 'note'), value: counts.Note },
    { icon: I.formatInkHighlighter, label: plural(counts.UserMark, 'highlight'), value: counts.UserMark },
    { icon: I.bookmark, label: plural(counts.Bookmark, 'bookmark'), value: counts.Bookmark },
    { icon: I.label, label: plural(Math.max(0, counts.Tag - playlistCount), 'tag'), value: counts.Tag - playlistCount },
    { icon: I.playlistPlay, label: plural(playlistCount, 'playlist'), value: playlistCount },
    { icon: I.permMedia, label: plural(mediaFileCount, 'media file'), value: mediaFileCount },
    { icon: I.editNote, label: plural(counts.InputField, 'input field'), value: counts.InputField },
  ];
}

/** JW Library highlight palette by `UserMark.ColorIndex`. */
export const HIGHLIGHT_COLORS: Record<number, { name: string; hex: string }> = {
  0: { name: 'No colour', hex: '#9aa3b8' },
  1: { name: 'Yellow', hex: '#fde047' },
  2: { name: 'Green', hex: '#86efac' },
  3: { name: 'Blue', hex: '#93c5fd' },
  4: { name: 'Pink', hex: '#f9a8d4' },
  5: { name: 'Orange', hex: '#fdba74' },
  6: { name: 'Purple', hex: '#d8b4fe' },
};

export function highlightColor(index: number): { name: string; hex: string } {
  return HIGHLIGHT_COLORS[index] ?? { name: `Colour ${index}`, hex: '#9aa3b8' };
}
