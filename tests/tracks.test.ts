import assert from 'node:assert/strict';
import test from 'node:test';

import { TRACK_DEFINITIONS, createTracks } from '../src/tracks.ts';

const ids = (first: number, last: number) =>
  Array.from(
    { length: last - first + 1 },
    (_, index) => `track-${String(first + index).padStart(2, '0')}`,
  );

test('the player exposes 105 tracks with unique stable IDs', () => {
  assert.equal(TRACK_DEFINITIONS.length, 105);
  assert.deepEqual(
    [...TRACK_DEFINITIONS.map(({ id }) => id)].sort((left, right) => Number(left.slice(6)) - Number(right.slice(6))),
    ids(1, 105),
  );
  assert.equal(new Set(TRACK_DEFINITIONS.map(({ id }) => id)).size, 105);
});

test('ALL keeps each original genre directly before its twenty new tracks', () => {
  assert.deepEqual(TRACK_DEFINITIONS.slice(0, 35).map(({ id }) => id), [...ids(1, 15), ...ids(46, 65)]);
  assert.deepEqual(TRACK_DEFINITIONS.slice(35, 70).map(({ id }) => id), [...ids(16, 30), ...ids(66, 85)]);
  assert.deepEqual(TRACK_DEFINITIONS.slice(70, 105).map(({ id }) => id), [...ids(31, 45), ...ids(86, 105)]);
});

test('existing favorite IDs retain their original catalog metadata', () => {
  const catalog = new Map(TRACK_DEFINITIONS.map((track) => [track.id, track]));

  assert.deepEqual(catalog.get('track-01'), {
    id: 'track-01',
    title: 'Quiet Motion',
    genre: 'chill',
    fileName: '001_Quiet_Motion_v2_96BPM.mp3',
  });
  assert.deepEqual(catalog.get('track-16'), {
    id: 'track-16',
    title: 'Sunlit Stone Avenue',
    genre: 'fantasy',
    fileName: '016_Sunlit_Stone_Avenue_90BPM.mp3',
  });
  assert.deepEqual(catalog.get('track-45'), {
    id: 'track-45',
    title: 'Dawn Beyond Bamboo',
    genre: 'japanese',
    fileName: '045_Dawn_Beyond_Bamboo.mp3',
  });
});

test('new tracks use their English MP3 filename titles without changing catalog metadata', () => {
  const newTracks = TRACK_DEFINITIONS.filter(({ id }) => Number(id.slice(6)) >= 46);

  assert.equal(newTracks.length, 60);
  for (const track of newTracks) {
    const expectedTitle = track.fileName
      .replace(/^\d{3}_/, '')
      .replace(/\.mp3$/, '')
      .replaceAll('_', ' ');
    assert.equal(track.title, expectedTitle, track.id);
    assert.match(track.title, /^[\x20-\x7e]+$/, track.id);
  }
});

test('runtime tracks use the configured audio base URL without changing catalog metadata', () => {
  const tracks = createTracks('/Lofi-Kawaii/audio/');

  assert.equal(tracks.length, 105);
  assert.equal(tracks[0].source, '/Lofi-Kawaii/audio/001_Quiet_Motion_v2_96BPM.mp3');
  assert.equal(tracks[104].source, '/Lofi-Kawaii/audio/105_Lingering_Moonlight.mp3');
  assert.equal(tracks[0].id, 'track-01');
  assert.equal(tracks[104].id, 'track-105');
});
