import { describe, expect, it } from 'vitest';
import * as R from '../../../tests/fixtures/rows';
import { computePlaylistItemSignature, type PlaylistItemSignatureInput } from './playlistSignature';

function input(overrides: Partial<PlaylistItemSignatureInput> = {}): PlaylistItemSignatureInput {
  return {
    item: R.playlistItem({ PlaylistItemId: 1, Label: 'L', Accuracy: 1 }),
    accuracyDescription: 'Accurate',
    thumbnailHash: 'h',
    locationMaps: [
      { locationKey: 1, MajorMultimediaType: 2, BaseDurationTicks: 10 },
      { locationKey: 2, MajorMultimediaType: 1, BaseDurationTicks: null },
    ],
    mediaMaps: [
      { mediaHash: 'a', DurationTicks: 1 },
      { mediaHash: 'b', DurationTicks: 2 },
    ],
    markers: [
      { marker: R.marker({ PlaylistItemMarkerId: 1, PlaylistItemId: 1, StartTimeTicks: 5 }), verseIds: [3, 1, 2], paragraphs: [R.paragraphMap(1, 9, 2), R.paragraphMap(1, 9, 1)] },
      { marker: R.marker({ PlaylistItemMarkerId: 2, PlaylistItemId: 1, StartTimeTicks: 9 }), verseIds: [], paragraphs: [] },
    ],
    ...overrides,
  };
}

describe('computePlaylistItemSignature', () => {
  it('ignores local ids and child ordering', () => {
    const a = computePlaylistItemSignature(input());
    const b = computePlaylistItemSignature(
      input({
        item: R.playlistItem({ PlaylistItemId: 99, Label: 'L', Accuracy: 42 }),
        locationMaps: [...input().locationMaps].reverse(),
        mediaMaps: [...input().mediaMaps].reverse(),
        markers: [...input().markers].reverse().map((m) => ({ ...m, verseIds: [...m.verseIds].reverse(), paragraphs: [...m.paragraphs].reverse() })),
      }),
    );
    expect(a).toBe(b);
  });

  it('changes when any structural detail changes', () => {
    const base = computePlaylistItemSignature(input());
    const variants = [
      input({ item: R.playlistItem({ PlaylistItemId: 1, Label: 'Other', Accuracy: 1 }) }),
      input({ item: R.playlistItem({ PlaylistItemId: 1, Label: 'L', Accuracy: 1, EndAction: 2 }) }),
      input({ item: R.playlistItem({ PlaylistItemId: 1, Label: 'L', Accuracy: 1, StartTrimOffsetTicks: 0 }) }),
      input({ accuracyDescription: 'NeedsUserVerification' }),
      input({ thumbnailHash: null }),
      input({ locationMaps: input().locationMaps.slice(1) }),
      input({ mediaMaps: [{ mediaHash: 'a', DurationTicks: 1 }, { mediaHash: 'b', DurationTicks: 3 }] }),
      input({ markers: input().markers.slice(1) }),
      input({ markers: input().markers.map((m, i) => (i === 0 ? { ...m, verseIds: [1, 2] } : m)) }),
      input({ markers: input().markers.map((m, i) => (i === 0 ? { ...m, paragraphs: [R.paragraphMap(1, 9, 2)] } : m)) }),
    ];
    const sigs = variants.map(computePlaylistItemSignature);
    for (const s of sigs) expect(s).not.toBe(base);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('treats NULL trims differently from zero trims', () => {
    const nul = computePlaylistItemSignature(input());
    const zero = computePlaylistItemSignature(input({ item: R.playlistItem({ PlaylistItemId: 1, Label: 'L', Accuracy: 1, StartTrimOffsetTicks: 0, EndTrimOffsetTicks: 0 }) }));
    expect(nul).not.toBe(zero);
  });
});
