import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toJpgUrl } from '../../lib/image-url.js';

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
