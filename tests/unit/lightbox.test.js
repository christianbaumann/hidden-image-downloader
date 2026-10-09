import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NoImageUrlError,
  imageCandidates,
  NoLightboxError,
  parseBackgroundImageUrl,
  toDownloadCandidates,
  UnsupportedPageError,
} from '../../lib/lightbox.js';
import { toAlbumZipRequest } from '../../lib/profile.js';
import { IMAGE_BASE, albumRaw, testUuid } from '../fixtures/album-api.js';

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

describe('toDownloadCandidates', () => {
  const raw = {
    style: 'background-image: url("https://x/img/a.webp?c=1"); opacity: 1',
    owner: 'BitPaerchen',
    photoId: '4711',
    pageUrl: BASE_URL,
  };
  const uuidStyle = `background-image: url("${IMAGE_BASE}/${testUuid(2)}/orig/image_1920_k.webp?cache=c")`;

  test('offers the jpg first, then the original webp, with one stem', () => {
    const candidates = toDownloadCandidates(raw);
    assert.deepEqual(candidates, [
      { url: 'https://x/img/a.jpg?c=1', filename: 'BitPaerchen_4711.jpg' },
      { url: 'https://x/img/a.webp?c=1', filename: 'BitPaerchen_4711.webp' },
    ]);
  });

  test('offers the full-size jpg first for a smaller variant', () => {
    const crop = `${IMAGE_BASE}/${testUuid(2)}/1-1/image_720_k.jpg?cache=c`;
    assert.deepEqual(imageCandidates(crop, { owner: 'TestOwner' }), [
      { url: `${IMAGE_BASE}/${testUuid(2)}/orig/image_1920_k.jpg`, filename: 'TestOwner_00000002.jpg' },
      { url: crop, filename: 'TestOwner_00000002.jpg' },
    ]);
  });

  test('offers full size, jpg sibling and the served webp of a webp crop', () => {
    const crop = `${IMAGE_BASE}/${testUuid(2)}/1-1/image_720_k.webp?cache=c`;
    assert.deepEqual(imageCandidates(crop, { owner: 'TestOwner' }).map(({ url }) => url), [
      `${IMAGE_BASE}/${testUuid(2)}/orig/image_1920_k.jpg`, crop.replace('.webp', '.jpg'), crop,
    ]);
  });

  test('keeps the served size of a gated image', () => {
    const crop = `${IMAGE_BASE}/${testUuid(2)}/1-1/image_720_k.jpg?cache=c`;
    assert.deepEqual(imageCandidates(crop, { owner: 'TestOwner', gated: true }).map(({ url }) => url), [crop]);
  });

  test('takes the photo key from a UUID image url over data-photo', () => {
    const [first, second] = toDownloadCandidates({ ...raw, style: uuidStyle });
    assert.equal(first.filename, 'BitPaerchen_00000002.jpg');
    assert.equal(second.filename, 'BitPaerchen_00000002.webp');
  });

  test('names an album photo like its entry in the profile ZIP', () => {
    const [first] = toDownloadCandidates({ ...raw, owner: 'TestOwner', style: uuidStyle, album: 'Aktuelles', position: 1, count: 1 });
    const { entries } = toAlbumZipRequest(albumRaw(), new Date());
    const zipEntry = entries.find(({ name }) => name.startsWith('Aktuelles/'));
    assert.equal(`Aktuelles/${first.filename}`, zipEntry.name);
  });

  test('offers only the original for a jpg', () => {
    const candidates = toDownloadCandidates({ ...raw, style: 'background-image: url("https://x/img/a.jpg")' });
    assert.deepEqual(candidates.map(({ url }) => url), ['https://x/img/a.jpg']);
  });

  test('throws NoLightboxError for null', () => {
    assert.throws(() => toDownloadCandidates(null), NoLightboxError);
    assert.throws(() => toDownloadCandidates(undefined), NoLightboxError);
  });

  test('throws NoImageUrlError for a style without url', () => {
    assert.throws(() => toDownloadCandidates({ ...raw, style: 'opacity: 1' }), NoImageUrlError);
  });

  test('falls back when owner and photo id are missing', () => {
    const [first] = toDownloadCandidates({ ...raw, owner: null, photoId: null });
    assert.equal(first.filename, 'unknown_image.jpg');
  });
});

describe('error classes', () => {
  test('carry their class name', () => {
    assert.equal(new NoLightboxError().name, 'NoLightboxError');
    assert.equal(new NoImageUrlError().name, 'NoImageUrlError');
    assert.equal(new UnsupportedPageError().name, 'UnsupportedPageError');
  });
});
