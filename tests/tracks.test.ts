import assert from 'node:assert/strict';
import test from 'node:test';

import { TRACK_DEFINITIONS, createTracks } from '../src/tracks.ts';

test('the player exposes all 45 tracks with unique stable IDs in playlist order', () => {
  assert.equal(TRACK_DEFINITIONS.length, 45);
  assert.deepEqual(
    TRACK_DEFINITIONS.map(({ id }) => id),
    Array.from({ length: 45 }, (_, index) => `track-${String(index + 1).padStart(2, '0')}`),
  );
  assert.equal(new Set(TRACK_DEFINITIONS.map(({ id }) => id)).size, 45);
});

test('stable IDs do not depend on the current MP3 filename', () => {
  assert.deepEqual(TRACK_DEFINITIONS[0], {
    id: 'track-01',
    title: 'Quiet Motion',
    fileName: '01_Quiet_Motion_v2_96BPM.mp3',
  });
});

test('runtime tracks use the configured audio base URL without changing catalog metadata', () => {
  const tracks = createTracks('/Lofi-Kawaii/audio/');

  assert.equal(tracks.length, 45);
  assert.equal(tracks[0].source, '/Lofi-Kawaii/audio/01_Quiet_Motion_v2_96BPM.mp3');
  assert.equal(tracks[44].source, '/Lofi-Kawaii/audio/45_Dawn_Beyond_Bamboo.mp3');
  assert.equal(tracks[0].id, 'track-01');
  assert.equal(tracks[44].id, 'track-45');
});
