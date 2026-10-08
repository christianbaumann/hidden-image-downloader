import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlbumApiError,
  NothingToDownloadError,
  photoKey,
  profileUserId,
  toZipRequest,
  toAlbumZipRequest,
  skippedReport,
  missingReport,
} from '../../lib/profile.js';
import { IMAGE_BASE, albumRaw, listResult, sourcesResult, testUuid } from '../fixtures/album-api.js';

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
    assert.equal(zipName, 'TestOwner_2026-10-08_174500.zip');
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

describe('profileUserId', () => {
  const DE = 'https://www.joyclub.de';

  test('reads the id from a profile URL', () => {
    assert.equal(profileUserId(`${DE}/profile/13140627.paar_der_ringe.html`), '13140627');
  });

  test('reads the id from album-overview and album URLs', () => {
    for (const path of ['fotos/42.slug.html', 'fotoalbum/42.slug.html', 'fotoalbum/42-4960900.slug.html']) {
      assert.equal(profileUserId(`${DE}/profile/${path}`), '42');
    }
  });

  test('accepts language prefixes on joyclub.com', () => {
    assert.equal(profileUserId('https://www.joyclub.com/en/profile/42.slug.html'), '42');
    assert.equal(profileUserId('https://www.joyclub.com/es-mx/profile/fotos/42.slug.html'), '42');
  });

  test('ignores hash and query', () => {
    assert.equal(profileUserId(`${DE}/profile/42.slug.html#media_id_0_1_2_3`), '42');
    assert.equal(profileUserId(`${DE}/profile/42.slug.html?tab=1`), '42');
  });

  test('returns null for other profile sub-pages', () => {
    assert.equal(profileUserId(`${DE}/profile/aktuelles/42.slug.html`), null);
    assert.equal(profileUserId(`${DE}/profile/zugriff/42.slug.html`), null);
  });

  test('returns null for other hosts and schemes', () => {
    assert.equal(profileUserId('https://example.com/profile/1.x.html'), null);
    assert.equal(profileUserId('http://www.joyclub.de/profile/1.x.html'), null);
    assert.equal(profileUserId('https://joyclub.de/profile/1.x.html'), null);
  });

  test('returns null for undefined, empty and non-URL input', () => {
    for (const value of [undefined, '', 'not a url']) {
      assert.equal(profileUserId(value), null);
    }
  });
});

const jpgUrl = (n) => `${IMAGE_BASE}/${testUuid(n)}/orig/image_1920_k.jpg?cache=c`;
const keyOf = (n) => testUuid(n).slice(0, 8);
const FIRST_ALBUM_ID = 900;
const names = (request) => request.entries.map((entry) => entry.name);
const folders = (request) => [...new Set(request.entries.map((entry) => entry.name.split('/')[0]))];

// albums: [{ title, ids } | { title, restricted, imageCount }]; every id resolves to testUuid(Number(id)).
function rawFor({ main = [], albums = [], notFound = [], ...rest }) {
  const ids = [...main, ...albums.flatMap((album) => album.ids ?? [])];
  const photos = ids.map((id) => (notFound.includes(id) ? { id, notFound: true } : { id, uuid: testUuid(Number(id)) }));
  const withIds = albums.map((album, index) => ({ id: String(FIRST_ALBUM_ID + index), ...album }));
  return albumRaw({ list: listResult({ main, albums: withIds }), sources: sourcesResult(photos), ...rest });
}

describe('toAlbumZipRequest', () => {
  test('puts each album into its own folder in API order', () => {
    const request = toAlbumZipRequest(rawFor({
      main: ['1'],
      albums: [{ title: 'Aktuelles', ids: ['2'] }, { title: 'Sie', ids: ['3'] }],
    }), DATE);
    assert.deepEqual(request.entries, [
      { url: jpgUrl(1), name: `Fotos-von-uns/TestOwner_Fotos-von-uns_01_${keyOf(1)}.jpg` },
      { url: jpgUrl(2), name: `Aktuelles/TestOwner_Aktuelles_01_${keyOf(2)}.jpg` },
      { url: jpgUrl(3), name: `Sie/TestOwner_Sie_01_${keyOf(3)}.jpg` },
    ]);
  });

  test('names the ZIP <owner>_<timestamp>.zip', () => {
    assert.equal(toAlbumZipRequest(albumRaw(), DATE).zipName, 'TestOwner_2026-10-08_174500.zip');
  });

  test('has no reports without restricted albums', () => {
    assert.deepEqual(toAlbumZipRequest(rawFor({ main: ['1'] }), DATE).reports, []);
  });

  test('throws AlbumApiError for null or failed raw', () => {
    assert.throws(() => toAlbumZipRequest(null, DATE), AlbumApiError);
    assert.throws(() => toAlbumZipRequest({ failed: true }, DATE), AlbumApiError);
  });

  test('throws AlbumApiError for a non-success or missing list', () => {
    assert.throws(() => toAlbumZipRequest(albumRaw({ list: { __typename: 'NotFound' } }), DATE), AlbumApiError);
    assert.throws(() => toAlbumZipRequest(albumRaw({ list: undefined }), DATE), AlbumApiError);
  });

  test('throws NothingToDownloadError when every album is empty or restricted', () => {
    const raw = rawFor({ albums: [{ title: 'Leer', ids: [] }, { title: 'Lady', restricted: true, imageCount: 9 }] });
    assert.throws(() => toAlbumZipRequest(raw, DATE), NothingToDownloadError);
  });

  test('throws NothingToDownloadError when every source is not found', () => {
    const raw = rawFor({ main: ['1'], albums: [{ title: 'A', ids: ['2'] }], notFound: ['1', '2'] });
    assert.throws(() => toAlbumZipRequest(raw, DATE), NothingToDownloadError);
  });

  test('lists a restricted album in skipped.txt and gives it no folder', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE);
    assert.deepEqual(folders(request), ['Fotos-von-uns', 'Aktuelles']);
    assert.deepEqual(request.reports, [{ name: 'skipped.txt', text: 'Lady (9 photos)\n' }]);
  });

  test('lists several restricted albums in API order', () => {
    const request = toAlbumZipRequest(rawFor({
      main: ['1'],
      albums: [{ title: 'B', restricted: true, imageCount: 2 }, { title: 'A', restricted: true, imageCount: 1 }],
    }), DATE);
    assert.equal(request.reports[0].text, 'B (2 photos)\nA (1 photos)\n');
  });

  test('gives an empty album no folder and does not list it as skipped', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], albums: [{ title: 'Leer', ids: [] }] }), DATE);
    assert.deepEqual(folders(request), ['Fotos-von-uns']);
    assert.deepEqual(request.reports, []);
  });

  test('numbers an album without gaps when a source is not found', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids: ['1', '2', '3'] }], notFound: ['2'] }), DATE);
    assert.deepEqual(names(request), [`A/TestOwner_A_01_${keyOf(1)}.jpg`, `A/TestOwner_A_02_${keyOf(3)}.jpg`]);
  });

  test('falls back to Hauptalbum without a main album title', () => {
    for (const mainAlbumTitle of ['', undefined]) {
      const request = toAlbumZipRequest(rawFor({ main: ['1'], mainAlbumTitle }), DATE);
      assert.deepEqual(folders(request), ['Hauptalbum']);
    }
  });

  test('dedupes a regular album named like the main album, ignoring case', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], albums: [{ title: 'fotos von uns', ids: ['2'] }] }), DATE);
    assert.deepEqual(folders(request), ['Fotos-von-uns', 'fotos-von-uns-2']);
  });

  test('dedupes two regular albums with the same title', () => {
    const request = toAlbumZipRequest(rawFor({
      albums: [{ title: 'Aktuelles', ids: ['1'] }, { title: 'Aktuelles', ids: ['2'] }],
    }), DATE);
    assert.deepEqual(folders(request), ['Aktuelles', 'Aktuelles-2']);
  });

  test('falls back to album for unusable titles and dedupes them', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: '???', ids: ['1'] }, { title: '???', ids: ['2'] }] }), DATE);
    assert.deepEqual(folders(request), ['album', 'album-2']);
  });

  test('keeps an album titled missing.txt apart from the report', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'missing.txt', ids: ['1'] }] }), DATE);
    assert.deepEqual(folders(request), ['missing.txt-2']);
  });

  test('does not reserve the name of an empty album', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids: [] }, { title: 'A', ids: ['1'] }] }), DATE);
    assert.deepEqual(folders(request), ['A']);
  });

  test('pads numbers per album', () => {
    const ids = (from, count) => Array.from({ length: count }, (_, i) => String(from + i));
    const request = toAlbumZipRequest(rawFor({
      albums: [{ title: 'One', ids: ids(1, 1) }, { title: 'Ninety', ids: ids(10, 99) }, { title: 'Hundred', ids: ids(200, 100) }],
    }), DATE);
    const numbers = (folder) => names(request)
      .filter((name) => name.startsWith(`${folder}/`))
      .map((name) => name.split('_').at(-2));
    assert.deepEqual(numbers('One'), ['01']);
    assert.deepEqual([numbers('Ninety')[0], numbers('Ninety').at(-1)], ['01', '99']);
    assert.deepEqual([numbers('Hundred')[0], numbers('Hundred').at(-1)], ['001', '100']);
  });

  test('omits the key for a non-UUID URL', () => {
    const json = JSON.stringify([{ mimeType: 'image/jpeg', sourceSet: [{ width: 1920, path: 'https://x/photos/a.jpg' }] }]);
    const sources = [{ id: '1', result: { __typename: 'ProfileAlbumImageSourceSuccessResult', source: { sourceListJson: json } } }];
    const request = toAlbumZipRequest(albumRaw({ list: listResult({ main: ['1'] }), sources }), DATE);
    assert.deepEqual(names(request), ['Fotos-von-uns/TestOwner_Fotos-von-uns_01.jpg']);
  });

  test('falls back to unknown for an empty owner', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], owner: '' }), DATE);
    assert.match(request.zipName, /^unknown_/);
    assert.equal(names(request)[0], `Fotos-von-uns/unknown_Fotos-von-uns_01_${keyOf(1)}.jpg`);
  });

  test('sanitises the owner', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], owner: 'Rück/Seite ' }), DATE);
    assert.match(request.zipName, /^Rück_Seite_2026/);
  });

  test('skips an empty main album', () => {
    const request = toAlbumZipRequest(rawFor({ main: [], albums: [{ title: 'A', ids: ['1'] }] }), DATE);
    assert.deepEqual(folders(request), ['A']);
  });

  test('keeps 325 photos over 23 albums with unique names', () => {
    let next = 1;
    const albums = Array.from({ length: 23 }, (_, i) => ({
      title: `Album ${i}`,
      ids: Array.from({ length: i === 0 ? 17 : 14 }, () => String(next++)),
    }));
    const request = toAlbumZipRequest(rawFor({ albums }), DATE);
    assert.equal(request.entries.length, 325);
    assert.equal(new Set(names(request)).size, 325);
  });
});

describe('skippedReport', () => {
  test('writes one line per album with a trailing newline', () => {
    assert.equal(skippedReport([{ title: 'Lady', imageCount: 9 }]), 'Lady (9 photos)\n');
  });

  test('trims trailing spaces from the title', () => {
    assert.equal(skippedReport([{ title: 'Sie  ', imageCount: 1 }]), 'Sie (1 photos)\n');
  });

  test('returns empty for no albums', () => {
    assert.equal(skippedReport([]), '');
  });
});
