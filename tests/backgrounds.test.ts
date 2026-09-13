import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  BACKGROUND_DEFINITIONS,
  BACKGROUND_STORAGE_KEY,
  DEFAULT_BACKGROUND_ID,
  createBackgrounds,
  loadBackgroundId,
  saveBackgroundId,
} from '../src/backgrounds.ts';

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem(key: string) {
      assert.equal(key, BACKGROUND_STORAGE_KEY);
      return value;
    },
    setItem(key: string, nextValue: string) {
      assert.equal(key, BACKGROUND_STORAGE_KEY);
      value = nextValue;
    },
    value() {
      return value;
    },
  };
}

test('background catalog contains the current default plus five unique selectable images', async () => {
  assert.equal(BACKGROUND_DEFINITIONS.length, 6);
  assert.equal(new Set(BACKGROUND_DEFINITIONS.map(({ id }) => id)).size, 6);
  assert.equal(new Set(BACKGROUND_DEFINITIONS.map(({ fileName }) => fileName)).size, 6);
  assert.equal(BACKGROUND_DEFINITIONS[0]?.id, DEFAULT_BACKGROUND_ID);

  for (const background of BACKGROUND_DEFINITIONS) {
    assert.match(background.id, /^background-[0-5]$/);
    assert.match(background.fileName, /^images\/(?:backgrounds\/)?[\w.-]+\.png$/);
    await access(path.join(process.cwd(), 'public', background.fileName));
  }
});

test('background presentation enables scene effects only for Moonlit Room', () => {
  assert.deepEqual(
    BACKGROUND_DEFINITIONS.map((background) => [
      background.id,
      background.tone,
      background.allowsAmbientEffects,
    ]),
    [
      ['background-0', 'night', true],
      ['background-1', 'night', false],
      ['background-2', 'night', false],
      ['background-3', 'day', false],
      ['background-4', 'day', false],
      ['background-5', 'day', false],
    ],
  );
});

test('runtime backgrounds use the configured base URL without changing stable IDs', () => {
  const backgrounds = createBackgrounds('/Lofi-Kawaii/', 'https://kmcapps.github.io/');
  assert.equal(
    backgrounds[0]?.source,
    'https://kmcapps.github.io/Lofi-Kawaii/images/03_lofi-background.png',
  );
  assert.equal(
    backgrounds[5]?.source,
    'https://kmcapps.github.io/Lofi-Kawaii/images/backgrounds/lofi-background-09.png',
  );
  assert.equal(backgrounds[0]?.id, DEFAULT_BACKGROUND_ID);
});

test('runtime backgrounds resolve a relative build base against the document URL', () => {
  const backgrounds = createBackgrounds('./', 'https://1542526202458415274.discordsays.com/');
  assert.equal(
    backgrounds[0]?.source,
    'https://1542526202458415274.discordsays.com/images/03_lofi-background.png',
  );
  assert.equal(
    backgrounds[5]?.source,
    'https://1542526202458415274.discordsays.com/images/backgrounds/lofi-background-09.png',
  );
});

test('every launch starts from Moonlit Room regardless of a previous selection', () => {
  for (const background of BACKGROUND_DEFINITIONS) {
    assert.equal(loadBackgroundId(createStorage(background.id)), DEFAULT_BACKGROUND_ID);
  }
});

test('load falls back to the current default for empty, unknown, or inaccessible storage', () => {
  assert.equal(loadBackgroundId(createStorage()), DEFAULT_BACKGROUND_ID);
  assert.equal(loadBackgroundId(createStorage('')), DEFAULT_BACKGROUND_ID);
  assert.equal(loadBackgroundId(createStorage('unknown-background')), DEFAULT_BACKGROUND_ID);
  assert.equal(loadBackgroundId({
    getItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
    setItem() {},
  }), DEFAULT_BACKGROUND_ID);
});

test('manual background selection stays in the current session without persistent storage', () => {
  const storage = createStorage();
  for (const background of BACKGROUND_DEFINITIONS) {
    assert.equal(saveBackgroundId(storage, background.id), background.id);
    assert.equal(storage.value(), null);
  }

  assert.equal(saveBackgroundId(storage, 'unknown-background'), DEFAULT_BACKGROUND_ID);
  assert.equal(storage.value(), null);

  const blockedStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
  };
  assert.doesNotThrow(() => saveBackgroundId(blockedStorage, 'background-2'));
  assert.equal(saveBackgroundId(blockedStorage, 'background-2'), 'background-2');
});

test('background launcher is a fixed viewport control outside the player library actions', async () => {
  const [mainSource, styleSource] = await Promise.all([
    readFile(path.join(process.cwd(), 'src', 'main.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'src', 'style.css'), 'utf8'),
  ]);

  assert.match(mainSource, /<button id="background-open" class="background-launcher"/);
  const libraryActions = mainSource.match(/<div class="library-actions">([\s\S]*?)<\/div>\s*<div class="controls">/);
  assert.ok(libraryActions);
  assert.doesNotMatch(libraryActions[1], /background-open/);
  assert.match(styleSource, /\.background-launcher \{[^}]*position: fixed;/);
});
