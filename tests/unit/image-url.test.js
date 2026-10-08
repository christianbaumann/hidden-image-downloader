import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toJpgUrl, largestJpegUrl } from '../../lib/image-url.js';
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
