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

test('runtime backgrounds use the configured base URL without changing stable IDs', () => {
  const backgrounds = createBackgrounds('/Lofi-Kawaii/');
  assert.equal(backgrounds[0]?.source, '/Lofi-Kawaii/images/03_lofi-background.png');
  assert.equal(backgrounds[5]?.source, '/Lofi-Kawaii/images/backgrounds/lofi-background-09.png');
  assert.equal(backgrounds[0]?.id, DEFAULT_BACKGROUND_ID);
});

test('load restores every valid background selection', () => {
  for (const background of BACKGROUND_DEFINITIONS) {
    assert.equal(loadBackgroundId(createStorage(background.id)), background.id);
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

test('save persists a valid selection and falls back safely for invalid IDs or storage errors', () => {
  const storage = createStorage();
  for (const background of BACKGROUND_DEFINITIONS) {
    assert.equal(saveBackgroundId(storage, background.id), background.id);
    assert.equal(storage.value(), background.id);
  }

  assert.equal(saveBackgroundId(storage, 'unknown-background'), DEFAULT_BACKGROUND_ID);
  assert.equal(storage.value(), DEFAULT_BACKGROUND_ID);

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
