import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstTrackIndex,
  moveWithinPlaylist,
  playlistTrackIndices,
  type PlaylistMode,
} from '../src/playlist-mode.ts';
import { TRACK_DEFINITIONS, type TrackDefinition } from '../src/tracks.ts';

const modes: Array<{ mode: PlaylistMode; first: number; last: number }> = [
  { mode: 'all', first: 0, last: 104 },
  { mode: 'chill', first: 0, last: 34 },
  { mode: 'fantasy', first: 35, last: 69 },
  { mode: 'japanese', first: 70, last: 104 },
];

const numbers = (mode: 'chill' | 'fantasy' | 'japanese') =>
  playlistTrackIndices(mode, TRACK_DEFINITIONS).map((index) => Number(TRACK_DEFINITIONS[index].fileName.slice(0, 3)));

test('genre playlists come from track definitions in numeric order', () => {
  assert.equal(playlistTrackIndices('all', TRACK_DEFINITIONS).length, 105);
  assert.deepEqual(numbers('chill'), [...range(1, 15), ...range(46, 65)]);
  assert.deepEqual(numbers('fantasy'), [...range(16, 30), ...range(66, 85)]);
  assert.deepEqual(numbers('japanese'), [...range(31, 45), ...range(86, 105)]);
});

function range(first: number, last: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

test('adding a track with a genre automatically joins that playlist in number order', () => {
  const extra: TrackDefinition = {
    id: 'track-106', title: 'New track', genre: 'japanese', fileName: '106_New_Track.mp3',
  };
  const catalog = [extra, ...TRACK_DEFINITIONS];
  const japanese = playlistTrackIndices('japanese', catalog);
  assert.equal(japanese.length, 36);
  assert.equal(catalog[japanese.at(-1)!].id, 'track-106');
  assert.equal(playlistTrackIndices('all', catalog)[0], 0);
});

test('each playlist starts from its first track', () => {
  for (const { mode, first } of modes) {
    assert.equal(firstTrackIndex(mode, TRACK_DEFINITIONS), first, mode);
  }
});

test('Next and ended advance through each genre, then wrap', () => {
  for (const { mode, first, last } of modes) {
    assert.equal(moveWithinPlaylist(last, 1, mode, TRACK_DEFINITIONS), first, mode);
  }
  assert.equal(moveWithinPlaylist(14, 1, 'chill', TRACK_DEFINITIONS), 15);
  assert.equal(moveWithinPlaylist(49, 1, 'fantasy', TRACK_DEFINITIONS), 50);
  assert.equal(moveWithinPlaylist(84, 1, 'japanese', TRACK_DEFINITIONS), 85);
  assert.equal(moveWithinPlaylist(104, 1, 'japanese', TRACK_DEFINITIONS), 70);
});

test('Previous wraps from each mode first track to its last track', () => {
  for (const { mode, first, last } of modes) {
    assert.equal(moveWithinPlaylist(first, -1, mode, TRACK_DEFINITIONS), last, mode);
  }
});

test('movement stays sequential inside the selected playlist mode', () => {
  assert.equal(moveWithinPlaylist(7, 1, 'chill', TRACK_DEFINITIONS), 8);
  assert.equal(moveWithinPlaylist(42, -1, 'fantasy', TRACK_DEFINITIONS), 41);
  assert.equal(moveWithinPlaylist(92, 1, 'japanese', TRACK_DEFINITIONS), 93);
});

test('an empty favorites playlist has no first or movable track', () => {
  assert.equal(firstTrackIndex('favorites', TRACK_DEFINITIONS, []), null);
  assert.equal(moveWithinPlaylist(12, 1, 'favorites', TRACK_DEFINITIONS, []), null);
  assert.equal(moveWithinPlaylist(12, -1, 'favorites', TRACK_DEFINITIONS, []), null);
});

test('a single favorite cycles to itself in both directions', () => {
  assert.equal(firstTrackIndex('favorites', TRACK_DEFINITIONS, [12]), 12);
  assert.equal(moveWithinPlaylist(12, 1, 'favorites', TRACK_DEFINITIONS, [12]), 12);
  assert.equal(moveWithinPlaylist(12, -1, 'favorites', TRACK_DEFINITIONS, [12]), 12);
});

test('favorites move in catalog order and wrap at both ends', () => {
  const favoriteIndices = [2, 7, 19, 41];

  assert.equal(moveWithinPlaylist(2, 1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 7);
  assert.equal(moveWithinPlaylist(19, -1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 7);
  assert.equal(moveWithinPlaylist(41, 1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 2);
  assert.equal(moveWithinPlaylist(2, -1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 41);
});

test('favorites choose the nearest track in the requested direction when current is not a favorite', () => {
  const favoriteIndices = [2, 7, 19, 41];

  assert.equal(moveWithinPlaylist(12, 1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 19);
  assert.equal(moveWithinPlaylist(12, -1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 7);
  assert.equal(moveWithinPlaylist(43, 1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 2);
  assert.equal(moveWithinPlaylist(1, -1, 'favorites', TRACK_DEFINITIONS, favoriteIndices), 41);
});
