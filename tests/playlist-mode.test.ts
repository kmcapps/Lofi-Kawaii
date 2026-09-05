import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstTrackIndex,
  moveWithinPlaylist,
  type PlaylistMode,
} from '../src/playlist-mode.ts';

const modes: Array<{
  mode: PlaylistMode;
  first: number;
  last: number;
}> = [
  { mode: 'all', first: 0, last: 44 },
  { mode: 'chill', first: 0, last: 14 },
  { mode: 'fantasy', first: 15, last: 29 },
  { mode: 'japanese', first: 30, last: 44 },
];

test('each playlist mode starts from its specified first track', () => {
  for (const { mode, first } of modes) {
    assert.equal(firstTrackIndex(mode), first, mode);
  }
});

test('Next wraps from each mode last track to its first track', () => {
  for (const { mode, first, last } of modes) {
    assert.equal(moveWithinPlaylist(last, 1, mode), first, mode);
  }
});

test('Previous wraps from each mode first track to its last track', () => {
  for (const { mode, first, last } of modes) {
    assert.equal(moveWithinPlaylist(first, -1, mode), last, mode);
  }
});

test('movement stays sequential inside the selected playlist mode', () => {
  assert.equal(moveWithinPlaylist(7, 1, 'chill'), 8);
  assert.equal(moveWithinPlaylist(22, -1, 'fantasy'), 21);
  assert.equal(moveWithinPlaylist(37, 1, 'japanese'), 38);
});
