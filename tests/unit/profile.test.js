import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NothingToDownloadError,
  photoKey,
  toZipRequest,
  missingReport,
} from '../../lib/profile.js';

const PAGE_URL = 'https://www.joyclub.de/profile/1.html';
const DATE = new Date(2026, 9, 8, 17, 45, 0);
const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

function srcset(uuid, ext = 'webp') {
  const base = `https://image-user.feig-partner.de/${uuid}/orig`;
  return `${base}/image_1920_k.${ext}?cache=c 1920w, ${base}/image_240_k.${ext}?cache=c 240w`;
}

function raw(items, owner = 'TestOwner') {
  return { owner, pageUrl: PAGE_URL, items };
}

describe('photoKey', () => {
  test('returns the first 8 chars of a UUID path segment', () => {
    assert.equal(photoKey(`https://x/${UUID_1}/orig/image_1920_k.jpg`), '11111111');
  });

  test('returns null when the first segment is no UUID', () => {
    assert.equal(photoKey('https://x/photos/orig/image_1920_k.jpg'), null);
  });

  test('returns null for an invalid URL', () => {
    assert.equal(photoKey('not a url'), null);
  });
});

describe('toZipRequest', () => {
  test('names entries <owner>_<nn>_<key>.jpg and prefers the 1920 jpg', () => {
    const { entries } = toZipRequest(raw([{ srcset: srcset(UUID_1) }, { srcset: srcset(UUID_2) }]), DATE);
    assert.deepEqual(entries, [
      {
        url: `https://image-user.feig-partner.de/${UUID_1}/orig/image_1920_k.jpg?cache=c`,
        name: 'TestOwner_01_11111111.jpg',
      },
      {
        url: `https://image-user.feig-partner.de/${UUID_2}/orig/image_1920_k.jpg?cache=c`,
        name: 'TestOwner_02_22222222.jpg',
      },
    ]);
  });

  test('names the ZIP <owner>_<timestamp>.zip', () => {
    const { zipName } = toZipRequest(raw([{ srcset: srcset(UUID_1) }]), DATE);
    assert.match(zipName, /^TestOwner_\d{4}-\d{2}-\d{2}_\d{6}\.zip$/);
  });

  test('throws NothingToDownloadError for null raw', () => {
    assert.throws(() => toZipRequest(null, DATE), NothingToDownloadError);
  });

  test('throws NothingToDownloadError for no items', () => {
    assert.throws(() => toZipRequest(raw([]), DATE), NothingToDownloadError);
  });

  test('throws NothingToDownloadError when every srcset is empty', () => {
    assert.throws(() => toZipRequest(raw([{ srcset: '' }, { srcset: '' }]), DATE), NothingToDownloadError);
  });

  test('numbers kept items without gaps', () => {
    const items = [{ srcset: srcset(UUID_1) }, { srcset: '' }, { srcset: srcset(UUID_2) }];
    const names = toZipRequest(raw(items), DATE).entries.map((entry) => entry.name);
    assert.deepEqual(names, ['TestOwner_01_11111111.jpg', 'TestOwner_02_22222222.jpg']);
  });

  test('pads a single item to 01', () => {
    const [entry] = toZipRequest(raw([{ srcset: srcset(UUID_1) }]), DATE).entries;
    assert.equal(entry.name, 'TestOwner_01_11111111.jpg');
  });

  test('keeps two digits for 99 items', () => {
    const items = Array.from({ length: 99 }, () => ({ srcset: srcset(UUID_1) }));
    const { entries } = toZipRequest(raw(items), DATE);
    assert.equal(entries.at(-1).name, 'TestOwner_99_11111111.jpg');
  });

  test('pads to three digits for 100 items', () => {
    const items = Array.from({ length: 100 }, () => ({ srcset: srcset(UUID_1) }));
    const { entries } = toZipRequest(raw(items), DATE);
    assert.equal(entries[0].name, 'TestOwner_001_11111111.jpg');
    assert.equal(entries.at(-1).name, 'TestOwner_100_11111111.jpg');
  });

  test('falls back to unknown for an empty owner', () => {
    const request = toZipRequest(raw([{ srcset: srcset(UUID_1) }], ''), DATE);
    assert.match(request.zipName, /^unknown_/);
    assert.equal(request.entries[0].name, 'unknown_01_11111111.jpg');
  });

  test('sanitises the owner and keeps umlauts', () => {
    const request = toZipRequest(raw([{ srcset: srcset(UUID_1) }], 'Rück/Seite'), DATE);
    assert.match(request.zipName, /^Rück_Seite_/);
    assert.equal(request.entries[0].name, 'Rück_Seite_01_11111111.jpg');
  });

  test('omits the key for a non-UUID URL', () => {
    const items = [{ srcset: 'https://x/photos/image_1920_k.webp 1920w' }];
    assert.equal(toZipRequest(raw(items), DATE).entries[0].name, 'TestOwner_01.jpg');
  });

  test('keeps a jpeg-only source URL unchanged', () => {
    const [entry] = toZipRequest(raw([{ srcset: srcset(UUID_1, 'jpg') }]), DATE).entries;
    assert.equal(entry.url, `https://image-user.feig-partner.de/${UUID_1}/orig/image_1920_k.jpg?cache=c`);
  });
});

describe('missingReport', () => {
  test('lists one URL per line with a trailing newline', () => {
    assert.equal(missingReport(['https://x/a', 'https://x/b']), 'https://x/a\nhttps://x/b\n');
  });

  test('lists a single URL on one line', () => {
    assert.equal(missingReport(['https://x/a']), 'https://x/a\n');
  });
});
