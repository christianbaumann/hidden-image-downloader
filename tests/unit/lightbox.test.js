import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NoImageUrlError,
  NoLightboxError,
  parseBackgroundImageUrl,
  toDownloadRequest,
  UnsupportedPageError,
} from '../../lib/lightbox.js';
import { buildFilename } from '../../lib/filename.js';

const BASE_URL = 'https://www.joyclub.de/profile/123.html';
const IMAGE_URL = 'https://x/a.webp?c=1';

describe('parseBackgroundImageUrl', () => {
  test('extracts the double-quoted url', () => {
    const style = `background-image: url("${IMAGE_URL}"); opacity: 1`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });

  test('accepts single quotes', () => {
    const style = `background-image: url('${IMAGE_URL}')`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });

  test('accepts unquoted url', () => {
    const style = `background-image: url(${IMAGE_URL})`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });

  test('tolerates extra whitespace and uppercase', () => {
    const style = `BACKGROUND-IMAGE :  URL(  "${IMAGE_URL}"  ) ;`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });

  test('ignores other properties before and after', () => {
    const style = `width: 100px; background-image: url("${IMAGE_URL}"); height: 50px; background-color: red`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });

  test('resolves a relative url against baseUrl', () => {
    const style = 'background-image: url("/img/full/a.webp")';
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), 'https://www.joyclub.de/img/full/a.webp');
  });

  test('returns null for background-image: none', () => {
    assert.equal(parseBackgroundImageUrl('background-image: none', BASE_URL), null);
  });

  test('returns null without background-image', () => {
    assert.equal(parseBackgroundImageUrl('opacity: 1; width: 10px', BASE_URL), null);
  });

  test('returns null for empty or null style', () => {
    assert.equal(parseBackgroundImageUrl('', BASE_URL), null);
    assert.equal(parseBackgroundImageUrl(null, BASE_URL), null);
  });

  test('returns null for a data: url', () => {
    const style = 'background-image: url("data:image/gif;base64,R0lGODlhAQABAAAAACw=")';
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), null);
  });

  test('takes the first of multiple urls', () => {
    const style = `background-image: url("${IMAGE_URL}"), url("https://x/b.webp")`;
    assert.equal(parseBackgroundImageUrl(style, BASE_URL), IMAGE_URL);
  });
});

describe('toDownloadRequest', () => {
  const date = new Date(2026, 9, 8, 17, 45, 0);
  const raw = {
    style: 'background-image: url("https://x/img/a.webp?c=1"); opacity: 1',
    title: 'Profilbild',
    owner: 'BitPaerchen',
    photoId: '4711',
    pageUrl: BASE_URL,
  };

  test('builds url and filename from full raw data', () => {
    const url = 'https://x/img/a.webp?c=1';
    const expected = buildFilename({ owner: raw.owner, title: raw.title, photoId: raw.photoId, url, date });
    const request = toDownloadRequest(raw, date);
    assert.deepEqual(request, { url, filename: expected });
    assert.equal(request.filename, 'BitPaerchen_Profilbild_2026-10-08_174500.webp');
  });

  test('throws NoLightboxError for null', () => {
    assert.throws(() => toDownloadRequest(null, date), NoLightboxError);
    assert.throws(() => toDownloadRequest(undefined, date), NoLightboxError);
  });

  test('throws NoImageUrlError for a style without url', () => {
    assert.throws(() => toDownloadRequest({ ...raw, style: 'opacity: 1' }, date), NoImageUrlError);
  });

  test('falls back when owner and title are missing', () => {
    const request = toDownloadRequest({ ...raw, owner: null, title: '' }, date);
    const expected = buildFilename({ owner: null, title: '', photoId: raw.photoId, url: request.url, date });
    assert.equal(request.filename, expected);
    assert.ok(request.filename.length > 0);
  });
});

describe('error classes', () => {
  test('carry their class name', () => {
    assert.equal(new NoLightboxError().name, 'NoLightboxError');
    assert.equal(new NoImageUrlError().name, 'NoImageUrlError');
    assert.equal(new UnsupportedPageError().name, 'UnsupportedPageError');
  });
});
