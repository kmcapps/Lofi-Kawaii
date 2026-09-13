import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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
    favorites: 'all',
  });
});

test('ALL and JAPANESE seek thumbs keep their motifs without an opaque base fill', async () => {
  const styleSource = await readFile(path.join(process.cwd(), 'src', 'style.css'), 'utf8');
  const allTheme = [...styleSource.matchAll(/\.seek-control \{([\s\S]*?)\}/g)].at(-1);
  const japaneseTheme = [...styleSource.matchAll(/\.seek-control\[data-theme="japanese"\] \{([\s\S]*?)\}/g)].at(-1);

  assert.ok(allTheme);
  assert.ok(japaneseTheme);
  assert.match(allTheme[1], /--seek-thumb:[\s\S]*transparent;/);
  assert.match(japaneseTheme[1], /--seek-thumb:[\s\S]*transparent;/);
});
