import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const [mainSource, styleSource] = await Promise.all([
  readFile(path.join(process.cwd(), 'src', 'main.ts'), 'utf8'),
  readFile(path.join(process.cwd(), 'src', 'style.css'), 'utf8'),
]);

test('the current track favorite toggle sits beside the track title', () => {
  const heading = mainSource.match(/<div class="track-heading">([\s\S]*?)<\/div>/)?.[1];

  assert.ok(heading);
  assert.match(heading, /id="track-title"/);
  assert.match(heading, /id="current-favorite-toggle"/);
  assert.match(heading, /aria-pressed="false"/);
});

test('the current track favorite toggle uses the existing favorite flow', () => {
  assert.match(mainSource, /currentFavoriteToggle\.addEventListener\('click'/);
  assert.match(mainSource, /toggleFavoriteTrackId\(favoriteTrackIds, tracks\[currentTrackIndex\]\.id, catalogTrackIds\)/);
  assert.match(mainSource, /currentFavoriteToggle\.setAttribute\('aria-pressed', String\(isCurrentFavorite\)\)/);
});

test('the current track favorite toggle uses a circular control style', () => {
  assert.match(styleSource, /\.current-favorite-toggle \{[^}]*border-radius: 50%;/);
});
