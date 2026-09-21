import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');

test('keeps the player panel centered at its default position', () => {
  const positionPanelAtDefault = source.match(
    /function positionPanelAtDefault\(\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(positionPanelAtDefault, 'default panel positioning should exist');
  assert.match(positionPanelAtDefault, /panelCenterX = window\.innerWidth \/ 2/);
  assert.match(positionPanelAtDefault, /panelCenterY = window\.innerHeight \/ 2/);
  assert.doesNotMatch(positionPanelAtDefault, /visualBottom/);
  assert.doesNotMatch(positionPanelAtDefault, /window\.innerHeight - VIEWPORT_MARGIN/);
});
