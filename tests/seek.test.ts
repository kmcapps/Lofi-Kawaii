import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampSeekTime,
  formatPlaybackTime,
  seekProgress,
  SEEK_THEME_BY_MODE,
} from '../src/seek.ts';

test('playback time is formatted as minutes and zero-padded seconds', () => {
  assert.equal(formatPlaybackTime(0), '0:00');
  assert.equal(formatPlaybackTime(84.9), '1:24');
  assert.equal(formatPlaybackTime(3599), '59:59');
});

test('unknown or invalid playback time is displayed safely', () => {
  assert.equal(formatPlaybackTime(Number.NaN), '0:00');
  assert.equal(formatPlaybackTime(Number.POSITIVE_INFINITY), '0:00');
  assert.equal(formatPlaybackTime(-12), '0:00');
});

test('seek time stays within the current track duration', () => {
  assert.equal(clampSeekTime(42, 180), 42);
  assert.equal(clampSeekTime(-10, 180), 0);
  assert.equal(clampSeekTime(240, 180), 180);
  assert.equal(clampSeekTime(20, Number.NaN), 0);
});

test('progress is calculated as a stable percentage', () => {
  assert.equal(seekProgress(45, 180), 25);
  assert.equal(seekProgress(-1, 180), 0);
  assert.equal(seekProgress(200, 180), 100);
  assert.equal(seekProgress(20, 0), 0);
});

test('each playlist mode has a matching seek bar theme', () => {
  assert.deepEqual(SEEK_THEME_BY_MODE, {
    all: 'all',
    chill: 'chill',
    fantasy: 'fantasy',
    japanese: 'japanese',
  });
});
