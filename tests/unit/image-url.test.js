import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toFullSizeUrl, toJpgUrl, largestJpegUrl } from '../../lib/image-url.js';
import { sourceListJson } from '../fixtures/album-api.js';

describe('toJpgUrl', () => {
  test('swaps .webp for .jpg and keeps the query', () => {
    assert.equal(
      toJpgUrl('https://x/u/orig/image_1920_k.webp?cache=x'),
      'https://x/u/orig/image_1920_k.jpg?cache=x',
    );
  });

  test('handles an uppercase extension', () => {
    assert.equal(toJpgUrl('https://x/a.WEBP'), 'https://x/a.jpg');
  });

  test('leaves .jpg, .png and extensionless URLs unchanged', () => {
    for (const url of ['https://x/a.jpg', 'https://x/a.png', 'https://x/a']) {
      assert.equal(toJpgUrl(url), url);
    }
  });

  test('ignores .webp in the query', () => {
    assert.equal(toJpgUrl('https://x/a.png?x=a.webp'), 'https://x/a.png?x=a.webp');
  });

  test('ignores .webp in a directory name', () => {
    assert.equal(toJpgUrl('https://x/a.webp/b.png'), 'https://x/a.webp/b.png');
  });

  test('returns an invalid URL unchanged', () => {
    assert.equal(toJpgUrl('not a url'), 'not a url');
  });
});

describe('largestJpegUrl', () => {
  const jpeg = (sourceSet) => JSON.stringify([{ mimeType: 'image/jpeg', sourceSet }]);

  test('picks the widest jpeg from a webp + jpeg list', () => {
    assert.equal(largestJpegUrl(sourceListJson('https://x', 'u')), 'https://x/u/orig/image_1920_k.jpg?cache=c');
  });

  test('picks the widest jpeg from an unordered set', () => {
    const json = jpeg([{ width: 240, path: 'https://x/240.jpg' }, { width: 1920, path: 'https://x/1920.jpg' }]);
    assert.equal(largestJpegUrl(json), 'https://x/1920.jpg');
  });

  test('returns a single-size jpeg', () => {
    assert.equal(largestJpegUrl(jpeg([{ width: 240, path: 'https://x/240.jpg' }])), 'https://x/240.jpg');
  });

  test('returns null for invalid JSON, null and empty', () => {
    for (const value of ['{', null, '']) {
      assert.equal(largestJpegUrl(value), null);
    }
  });

  test('returns null without a jpeg entry', () => {
    const json = JSON.stringify([{ mimeType: 'image/webp', sourceSet: [{ width: 1920, path: 'https://x/a.webp' }] }]);
    assert.equal(largestJpegUrl(json), null);
  });

  test('returns null for an empty jpeg set', () => {
    assert.equal(largestJpegUrl(jpeg([])), null);
  });

  test('returns null for a non-http or relative path', () => {
    assert.equal(largestJpegUrl(jpeg([{ width: 1920, path: 'javascript:alert(1)' }])), null);
    assert.equal(largestJpegUrl(jpeg([{ width: 1920, path: '/u/a.jpg' }])), null);
  });
});

describe('toFullSizeUrl', () => {
  const UUID_PATH = 'https://image-user.feig-partner.de/08d44c36-e94c-40f4-b36b-206859061a45';

  test('turns a crop into the full-size jpg of the same photo, without the cache query', () => {
    assert.equal(toFullSizeUrl(`${UUID_PATH}/1-1/image_720_B5Csj.jpg?cache=x`), `${UUID_PATH}/orig/image_1920_B5Csj.jpg`);
  });

  test('turns a small webp into the full-size jpg', () => {
    assert.equal(toFullSizeUrl(`${UUID_PATH}/orig/image_180_t9.webp`), `${UUID_PATH}/orig/image_1920_t9.jpg`);
  });

  test('returns null for a pixelated FSK18 variant, whose full size has another token', () => {
    assert.equal(toFullSizeUrl(`${UUID_PATH}/orig/image_180_pxl_GB2iW.jpg`), null);
  });

  test('returns null for a full-size image', () => {
    assert.equal(toFullSizeUrl(`${UUID_PATH}/orig/image_1920_B5Csj.webp?cache=x`), null);
  });

  test('returns null for other URLs', () => {
    assert.equal(toFullSizeUrl('https://x/img/a.webp?c=1'), null);
    assert.equal(toFullSizeUrl('not a url'), null);
  });
});
