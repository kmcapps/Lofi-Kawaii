import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FAVORITES_STORAGE_KEY,
  loadFavoriteTrackIds,
  saveFavoriteTrackIds,
  toggleFavoriteTrackId,
} from '../src/favorites.ts';
import { TRACK_DEFINITIONS } from '../src/tracks.ts';

const catalogIds = ['track-a', 'track-b', 'track-c', 'track-d'];

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem(key: string) {
      assert.equal(key, FAVORITES_STORAGE_KEY);
      return value;
    },
    setItem(key: string, nextValue: string) {
      assert.equal(key, FAVORITES_STORAGE_KEY);
      value = nextValue;
    },
    value() {
      return value;
    },
  };
}

test('load normalizes stored favorites to unique known IDs in catalog order', () => {
  const storage = createStorage(JSON.stringify([
    'track-d',
    'unknown',
    42,
    'track-b',
    'track-d',
  ]));

  assert.deepEqual(loadFavoriteTrackIds(storage, catalogIds), ['track-b', 'track-d']);
});

test('load treats malformed JSON and non-array JSON as no favorites', () => {
  assert.deepEqual(loadFavoriteTrackIds(createStorage('{'), catalogIds), []);
  assert.deepEqual(loadFavoriteTrackIds(createStorage('{}'), catalogIds), []);
});

test('load fails open when storage access is denied', () => {
  const storage = {
    getItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
    setItem() {},
  };

  assert.doesNotThrow(() => loadFavoriteTrackIds(storage, catalogIds));
  assert.deepEqual(loadFavoriteTrackIds(storage, catalogIds), []);
});

test('save persists only unique known IDs in catalog order', () => {
  const storage = createStorage();

  const saved = saveFavoriteTrackIds(
    storage,
    ['track-c', 'track-a', 'track-c', 'unknown'],
    catalogIds,
  );

  assert.deepEqual(saved, ['track-a', 'track-c']);
  assert.equal(storage.value(), JSON.stringify(['track-a', 'track-c']));
});

test('save fails open and still returns the normalized favorites', () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
  };

  assert.doesNotThrow(() => saveFavoriteTrackIds(storage, ['track-c'], catalogIds));
  assert.deepEqual(saveFavoriteTrackIds(storage, ['track-c'], catalogIds), ['track-c']);
});

test('toggle adds or removes a known track while preserving catalog order', () => {
  assert.deepEqual(toggleFavoriteTrackId(['track-c'], 'track-a', catalogIds), [
    'track-a',
    'track-c',
  ]);
  assert.deepEqual(toggleFavoriteTrackId(['track-c', 'track-a'], 'track-c', catalogIds), [
    'track-a',
  ]);
  assert.deepEqual(toggleFavoriteTrackId(['track-a'], 'unknown', catalogIds), ['track-a']);
});

test('stored legacy favorites survive the 105-track catalog and new tracks can be toggled', () => {
  const trackIds = TRACK_DEFINITIONS.map(({ id }) => id);
  const storage = createStorage(JSON.stringify(['track-01', 'track-45']));
  const restored = loadFavoriteTrackIds(storage, trackIds);
  assert.deepEqual(restored, ['track-01', 'track-45']);

  const added = toggleFavoriteTrackId(restored, 'track-105', trackIds);
  assert.deepEqual(saveFavoriteTrackIds(storage, added, trackIds), ['track-01', 'track-45', 'track-105']);
  assert.deepEqual(toggleFavoriteTrackId(added, 'track-105', trackIds), restored);
});
