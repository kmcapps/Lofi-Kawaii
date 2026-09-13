export const PLAYLIST_RANGES = {
  all: { first: 0, last: 44 },
  chill: { first: 0, last: 14 },
  fantasy: { first: 15, last: 29 },
  japanese: { first: 30, last: 44 },
} as const;

type RangedPlaylistMode = keyof typeof PLAYLIST_RANGES;
export type PlaylistMode = RangedPlaylistMode | 'favorites';

export function firstTrackIndex(mode: PlaylistMode, favoriteIndices: readonly number[] = []) {
  if (mode === 'favorites') return favoriteIndices[0] ?? null;
  return PLAYLIST_RANGES[mode].first;
}

export function moveWithinPlaylist(
  currentIndex: number,
  offset: number,
  mode: PlaylistMode,
  favoriteIndices: readonly number[] = [],
) {
  if (mode === 'favorites') {
    const length = favoriteIndices.length;
    if (length === 0) return null;

    const currentPosition = favoriteIndices.indexOf(currentIndex);
    if (currentPosition >= 0) {
      return favoriteIndices[((currentPosition + offset) % length + length) % length];
    }

    if (offset > 0) {
      const nextPosition = favoriteIndices.findIndex((index) => index > currentIndex);
      const firstMovePosition = nextPosition >= 0 ? nextPosition : 0;
      return favoriteIndices[(firstMovePosition + offset - 1) % length];
    }

    if (offset < 0) {
      let previousPosition = length - 1;
      for (let index = length - 1; index >= 0; index -= 1) {
        if (favoriteIndices[index] < currentIndex) {
          previousPosition = index;
          break;
        }
      }
      return favoriteIndices[((previousPosition + offset + 1) % length + length) % length];
    }

    return currentIndex;
  }

  const { first, last } = PLAYLIST_RANGES[mode];
  const length = last - first + 1;
  return first + ((currentIndex - first + offset) % length + length) % length;
}
