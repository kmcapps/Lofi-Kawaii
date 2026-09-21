import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('current track favorite feedback has a polite live region above the heart control', () => {
  assert.match(mainSource, /<div class="track-heading">[\s\S]*id="favorite-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden[\s\S]*<\/div>/);
});

test('favorite feedback restarts cleanly and is removed after its brief display', () => {
  assert.match(mainSource, /function showFavoriteFeedback\(message: string, shouldBounce: boolean\)/);
  assert.match(mainSource, /window\.clearTimeout\(favoriteFeedbackTimer\)/);
  assert.match(mainSource, /favoriteFeedback\.classList\.remove\('is-visible'\)/);
  assert.match(mainSource, /favoriteFeedback\.hidden = true/);
  assert.match(mainSource, /}, 1250\)/);
});

test('the current track toggle reports both favorite outcomes without changing the saved favorite flow', () => {
  assert.match(mainSource, /const wasFavorite = favoriteTrackIds\.includes\(tracks\[currentTrackIndex\]\.id\)/);
  assert.match(mainSource, /wasFavorite \? 'Removed from Favorites' : 'Added to Favorites ♥'/);
  assert.match(mainSource, /toggleFavoriteTrackId\(favoriteTrackIds, tracks\[currentTrackIndex\]\.id, catalogTrackIds\)/);
  assert.match(mainSource, /saveFavoriteTrackIds\(favoritesStorage, favoriteTrackIds, catalogTrackIds\)/);
});

test('feedback is overlayed above the heart and the add action bounces both favorite controls', () => {
  assert.match(styleSource, /\.track-heading \{[^}]*position: relative;/);
  assert.match(styleSource, /\.favorite-feedback \{[^}]*bottom: calc\(100% \+ 8px\);[^}]*left: calc\(100% - 16px\);/);
  assert.match(styleSource, /\.current-favorite-toggle\.is-bouncing \{[^}]*favorite-heart-bounce/);
  assert.match(styleSource, /\.favorites-mode\.is-bouncing \{[^}]*will-change: transform/);
  assert.match(mainSource, /favoritesModeButton\.style\.transform = 'translateY\(-1px\) scale\(1\.08\)'/);
  assert.match(mainSource, /favoritesModeButton\.style\.removeProperty\('transform'\)/);
  assert.match(styleSource, /@keyframes favorite-heart-bounce/);
  assert.match(styleSource, /@keyframes favorite-feedback/);
});
