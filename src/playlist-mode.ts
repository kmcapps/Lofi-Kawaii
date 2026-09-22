import type { TrackDefinition } from './tracks';

export type PlaylistMode = 'all' | TrackDefinition['genre'] | 'favorites';

export function playlistTrackIndices(
  mode: Exclude<PlaylistMode, 'favorites'>,
  catalog: readonly TrackDefinition[],
): number[] {
  const indices = catalog.flatMap((track, index) =>
    mode === 'all' || track.genre === mode ? [index] : [],
  );
  if (mode !== 'all') {
    indices.sort((left, right) =>
      Number(catalog[left].fileName.slice(0, 3)) - Number(catalog[right].fileName.slice(0, 3)),
    );
  }
  return indices;
}

export function firstTrackIndex(
  mode: PlaylistMode,
  catalog: readonly TrackDefinition[],
  favoriteIndices: readonly number[] = [],
) {
  if (mode === 'favorites') return favoriteIndices[0] ?? null;
  return playlistTrackIndices(mode, catalog)[0] ?? null;
}

export function moveWithinPlaylist(
  currentIndex: number,
  offset: number,
  mode: PlaylistMode,
  catalog: readonly TrackDefinition[],
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

  const indices = playlistTrackIndices(mode, catalog);
  if (indices.length === 0) return null;
  const currentPosition = indices.indexOf(currentIndex);
  return indices[((currentPosition + offset) % indices.length + indices.length) % indices.length] ?? indices[0];
}
