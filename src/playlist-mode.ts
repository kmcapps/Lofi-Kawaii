export const PLAYLIST_RANGES = {
  all: { first: 0, last: 44 },
  chill: { first: 0, last: 14 },
  fantasy: { first: 15, last: 29 },
  japanese: { first: 30, last: 44 },
} as const;

export type PlaylistMode = keyof typeof PLAYLIST_RANGES;

export function firstTrackIndex(mode: PlaylistMode) {
  return PLAYLIST_RANGES[mode].first;
}

export function moveWithinPlaylist(currentIndex: number, offset: number, mode: PlaylistMode) {
  const { first, last } = PLAYLIST_RANGES[mode];
  const length = last - first + 1;
  return first + ((currentIndex - first + offset) % length + length) % length;
}
