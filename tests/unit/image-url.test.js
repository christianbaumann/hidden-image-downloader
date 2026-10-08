import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toJpgUrl, largestSrcsetUrl } from '../../lib/image-url.js';

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

describe('largestSrcsetUrl', () => {
  const BASE = 'https://www.joyclub.de/profile/1.html';
  const IMAGE = 'https://image-user.feig-partner.de/11111111-1111-4111-8111-111111111111/orig';
  const WIDTHS = [1920, 1440, 960, 720, 480, 420, 360, 300, 240];

  test('picks the 1920w candidate of a real-shape srcset', () => {
    const srcset = WIDTHS.map((w) => `${IMAGE}/image_${w}_k.webp?cache=h ${w}w`).join(', ');
    assert.equal(largestSrcsetUrl(srcset, BASE), `${IMAGE}/image_1920_k.webp?cache=h`);
  });

  test('picks the widest candidate regardless of order', () => {
    assert.equal(largestSrcsetUrl('https://x/m 800w, https://x/l 1920w, https://x/s 240w', BASE), 'https://x/l');
  });

  test('returns a single candidate', () => {
    assert.equal(largestSrcsetUrl('https://x/a 240w', BASE), 'https://x/a');
  });

  test('keeps the first candidate on equal widths', () => {
    assert.equal(largestSrcsetUrl('https://x/a 800w, https://x/b 800w', BASE), 'https://x/a');
  });

  test('returns null for empty, null or whitespace-only input', () => {
    for (const srcset of ['', null, '  \n ']) {
      assert.equal(largestSrcsetUrl(srcset, BASE), null);
    }
  });

  test('ignores candidates without a w descriptor', () => {
    assert.equal(largestSrcsetUrl('https://x/a 2x, https://x/b, https://x/c 240w', BASE), 'https://x/c');
    assert.equal(largestSrcsetUrl('https://x/a 2x, https://x/b', BASE), null);
  });

  test('resolves a relative URL against baseUrl', () => {
    assert.equal(largestSrcsetUrl('/img/a.jpg 240w', BASE), 'https://www.joyclub.de/img/a.jpg');
  });

  test('rejects a data: URL', () => {
    assert.equal(largestSrcsetUrl('data:image/gif;base64,R0lGOD 1w', BASE), null);
  });

  test('tolerates extra whitespace and newlines between candidates', () => {
    assert.equal(largestSrcsetUrl('\n  https://x/a   240w ,\n\t https://x/b\t1920w\n', BASE), 'https://x/b');
  });
});
