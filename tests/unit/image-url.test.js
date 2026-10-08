import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toJpgUrl, largestSrcsetUrl, largestJpegUrl } from '../../lib/image-url.js';
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

describe('largestSrcsetUrl', () => {
  const BASE = 'https://www.joyclub.de/profile/1.html';
  const IMAGE = 'https://image-user.feig-partner.de/11111111-1111-4111-8111-111111111111/orig';
  const WIDTHS = [1920, 1440, 960, 720, 480, 420, 360, 300, 240];

  test('picks the 1920w candidate of a real-shape srcset', () => {
    const srcset = WIDTHS.map((w) => `${IMAGE}/image_${w}_k.webp?cache=h ${w}w`).join(', ');
    assert.equal(largestSrcsetUrl(srcset, BASE), `${IMAGE}/image_1920_k.webp?cache=h`);
  });

  test('splits candidates separated by a bare comma, as JoyClub writes them', () => {
    const srcset = WIDTHS.map((w) => `${IMAGE}/image_${w}_k.webp?cache=h ${w}w`).join(',');
    assert.equal(largestSrcsetUrl(srcset, BASE), `${IMAGE}/image_1920_k.webp?cache=h`);
  });

  test('keeps commas inside a data: URL next to bare-comma candidates', () => {
    assert.equal(largestSrcsetUrl('data:image/gif;base64,R0lGOD 1w,https://x/a 240w', BASE), 'https://x/a');
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
