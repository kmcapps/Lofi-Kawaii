import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { TRACK_DEFINITIONS } from '../src/tracks.ts';

const publicAudioDirectory = fileURLToPath(new URL('../public/audio/', import.meta.url));
const assetsAudioDirectory = fileURLToPath(new URL('../assets/audio/', import.meta.url));

async function mp3Files(directory: string) {
  return (await readdir(directory)).filter((fileName) => fileName.endsWith('.mp3')).sort();
}

function album(bytes: Buffer) {
  assert.equal(bytes.toString('ascii', 0, 3), 'ID3');
  assert.ok(bytes[3] === 3 || bytes[3] === 4, 'ID3v2.3 or ID3v2.4');
  const version = bytes[3];

  const tagSize =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  let offset = 10;
  const end = offset + tagSize;

  while (offset + 10 <= end) {
    const id = bytes.toString('ascii', offset, offset + 4);
    if (id === '\0\0\0\0') break;
    const size = version === 3
      ? bytes.readUInt32BE(offset + 4)
      : ((bytes[offset + 4] & 0x7f) << 21) |
        ((bytes[offset + 5] & 0x7f) << 14) |
        ((bytes[offset + 6] & 0x7f) << 7) |
        (bytes[offset + 7] & 0x7f);
    if (size < 1 || offset + 10 + size > end) break;
    if (id === 'TALB') {
      const encoding = bytes[offset + 10];
      assert.ok(encoding === 0 || encoding === 3, 'Album frame has a supported text encoding');
      return bytes
        .toString(encoding === 0 ? 'latin1' : 'utf8', offset + 11, offset + 10 + size)
        .replace(/\0.*$/, '');
    }
    offset += 10 + size;
  }

  throw new Error('Missing TALB frame');
}

test('catalog filenames use every three-digit number from 001 through 105 exactly once', () => {
  const numbers = TRACK_DEFINITIONS.map(({ fileName }) => {
    assert.match(fileName, /^(\d{3})_/);
    return Number(fileName.slice(0, 3));
  }).sort((left, right) => left - right);

  assert.deepEqual(numbers, Array.from({ length: 105 }, (_, index) => index + 1));
});

test('public and assets audio contain the same 105 catalog MP3 files', async () => {
  const expectedFiles = TRACK_DEFINITIONS.map(({ fileName }) => fileName).sort();
  const [publicFiles, assetFiles] = await Promise.all([
    mp3Files(publicAudioDirectory),
    mp3Files(assetsAudioDirectory),
  ]);

  assert.deepEqual(publicFiles, expectedFiles);
  assert.deepEqual(assetFiles, expectedFiles);
});

test('public and assets audio bytes are synchronized for every catalog track', async () => {
  for (const { fileName } of TRACK_DEFINITIONS) {
    const [publicBytes, assetBytes] = await Promise.all([
      readFile(`${publicAudioDirectory}${fileName}`),
      readFile(`${assetsAudioDirectory}${fileName}`),
    ]);

    assert.equal(publicBytes.length, assetBytes.length, fileName);
    assert.equal(
      createHash('sha256').update(publicBytes).digest('hex'),
      createHash('sha256').update(assetBytes).digest('hex'),
      fileName,
    );
  }
});

test('every track has matching genre Album metadata in both audio sets', async () => {
  const expectedAlbum = (trackNumber: number) => {
    if ((trackNumber <= 15) || (trackNumber >= 46 && trackNumber <= 65)) return 'CHILL';
    if ((trackNumber <= 30) || (trackNumber >= 66 && trackNumber <= 85)) return 'FANTASY';
    return 'JAPANESE';
  };

  for (const { fileName, genre } of TRACK_DEFINITIONS) {
    const trackNumber = Number(fileName.slice(0, 3));
    const [publicBytes, assetBytes] = await Promise.all([
      readFile(`${publicAudioDirectory}${fileName}`),
      readFile(`${assetsAudioDirectory}${fileName}`),
    ]);

    assert.equal(album(publicBytes), expectedAlbum(trackNumber), `public/audio/${fileName}`);
    assert.equal(album(assetBytes), expectedAlbum(trackNumber), `assets/audio/${fileName}`);
    assert.equal(genre.toUpperCase(), expectedAlbum(trackNumber), `catalog ${fileName}`);
  }
});
