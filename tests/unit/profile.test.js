import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlbumApiError,
  ClubMailApiError,
  fetchProfileAlbums,
  NothingToDownloadError,
  photoKey,
  profileUserId,
  toAlbumZipRequest,
  toClubMailZipRequest,
  skippedReport,
  missingReport,
} from '../../lib/profile.js';
import {
  IMAGE_BASE, albumRaw, captionsResult, listResult, profileTextResult, sourcesResult, testUuid,
} from '../fixtures/album-api.js';
import { filterNewEntries, savedRecord } from '../../lib/incremental.js';
import { ME, ORIGIN, PARTNER, attachmentMessage, textMessage } from '../fixtures/clubmail-api.js';
import { SIGNED_QUERY, VIDEO_ID_1, VIDEO_ID_2, masterUrlOf, signingUrlOf } from '../fixtures/video-api.js';

const DATE = new Date(2026, 9, 8, 17, 45, 0);
const PROFILE_REPORTS = ['profile.md', 'profile.html'];
const withoutProfile = (reports) => reports.filter(({ name }) => !PROFILE_REPORTS.includes(name));
const UUID_1 = '11111111-1111-4111-8111-111111111111';
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
      { url: jpgUrl(1), name: `Fotos-von-uns/TestOwner_Fotos-von-uns_01_${keyOf(1)}.jpg`, photoKey: keyOf(1) },
      { url: jpgUrl(2), name: `Aktuelles/TestOwner_Aktuelles_01_${keyOf(2)}.jpg`, photoKey: keyOf(2) },
      { url: jpgUrl(3), name: `Sie/TestOwner_Sie_01_${keyOf(3)}.jpg`, photoKey: keyOf(3) },
    ]);
  });

  test('puts the photo title before the key, sanitised', () => {
    const captions = captionsResult([
      { id: '1', title: 'Rück Ansicht' }, { id: '2', title: '#1: 100% & mehr' }, { id: '3', title: 'nul' },
    ]);
    const request = toAlbumZipRequest(rawFor({ main: ['1'], albums: [{ title: 'A', ids: ['2', '3'] }], captions }), DATE);

    assert.deepEqual(request.entries.map(({ name }) => name), [
      `Fotos-von-uns/TestOwner_Fotos-von-uns_01_Rück-Ansicht_${keyOf(1)}.jpg`,
      `A/TestOwner_A_01_#1_-100%-&-mehr_${keyOf(2)}.jpg`,
      `A/TestOwner_A_02_nul__${keyOf(3)}.jpg`,
    ]);
  });

  test('keeps the name without title for placeholder, missing or failed captions', () => {
    const captions = captionsResult([{ id: '1', title: '...' }, { id: '2', title: 'Profilbild' }, { id: '3', notFound: true }]);
    const names = (raw) => toAlbumZipRequest(raw, DATE).entries.map(({ name }) => name);
    const expected = [1, 2, 3, 4].map((n) => `A/TestOwner_A_0${n}_${keyOf(n)}.jpg`);

    assert.deepEqual(names(rawFor({ albums: [{ title: 'A', ids: ['1', '2', '3', '4'] }], captions })), expected);
    assert.deepEqual(names(rawFor({ albums: [{ title: 'A', ids: ['1', '2', '3', '4'] }], captions: null })), expected);
  });

  test('a photo saved before it got a title is not new', () => {
    const before = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids: ['1'] }] }), DATE);
    const captions = captionsResult([{ id: '1', title: 'Neu' }]);
    const after = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids: ['1', '2'] }], captions }), DATE);

    const { request } = filterNewEntries(after, savedRecord(before.entries, []));

    assert.deepEqual(request.entries.map(({ name }) => name), [`A/TestOwner_A_02_${keyOf(2)}.jpg`]);
  });

  test('keeps a long titled name within 200 UTF-8 bytes', () => {
    const captions = captionsResult([{ id: '1', title: '😀'.repeat(80) }]);
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: '写真'.repeat(40), ids: ['1'] }], captions }), DATE);
    const fileName = request.entries[0].name.split('/')[1];

    assert.ok(new TextEncoder().encode(fileName).length <= 200);
    assert.match(fileName, new RegExp(`^TestOwner_(写真)+写?_01_${keyOf(1)}\\.jpg$`, 'u'));
  });

  test('names the ZIP <owner>.zip', () => {
    assert.equal(toAlbumZipRequest(albumRaw(), DATE).zipName, 'TestOwner.zip');
  });

  test('has only the profile files without restricted albums', () => {
    assert.deepEqual(toAlbumZipRequest(rawFor({ main: ['1'] }), DATE).reports.map(({ name }) => name), PROFILE_REPORTS);
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
    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\n' }]);
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
    assert.deepEqual(withoutProfile(request.reports), []);
  });

  test('numbers photos by their album position, leaving a gap for a source not found', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids: ['1', '2', '3'] }], notFound: ['2'] }), DATE);
    assert.deepEqual(names(request), [`A/TestOwner_A_01_${keyOf(1)}.jpg`, `A/TestOwner_A_03_${keyOf(3)}.jpg`]);
  });

  test('pads numbers to the album length, also when sources are not found', () => {
    const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'A', ids }], notFound: ids.slice(1) }), DATE);
    assert.deepEqual(names(request), [`A/TestOwner_A_001_${keyOf(1)}.jpg`]);
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
    assert.equal('photoKey' in request.entries[0], false);
  });

  test('falls back to unknown for an empty owner', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], owner: '' }), DATE);
    assert.equal(request.zipName, 'unknown.zip');
    assert.equal(names(request)[0], `Fotos-von-uns/unknown_Fotos-von-uns_01_${keyOf(1)}.jpg`);
  });

  test('sanitises the owner', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], owner: 'Rück/Seite ' }), DATE);
    assert.match(request.zipName, /^Rück_Seite\.zip$/);
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

describe('toAlbumZipRequest profile files', () => {
  const PROFILE_TEXT = profileTextResult({ motto: 'Carpe diem', description: 'Hallo [b]ihr[/b]' });
  const report = (request, name) => request.reports.find((entry) => entry.name === name)?.text;
  const withAlbumDescription = () => listResult({
    main: ['101'],
    albums: [
      { id: '201', title: 'Aktuelles', ids: ['102'] },
      { id: '202', title: 'Lady', restricted: true, imageCount: 9 },
    ],
  });

  test('adds profile.md and profile.html after the other reports', () => {
    const request = toAlbumZipRequest(albumRaw({ profileText: PROFILE_TEXT }), DATE);

    assert.deepEqual(request.reports.map(({ name }) => name), ['skipped.txt', ...PROFILE_REPORTS]);
  });

  test('profile.md holds the profile text and every saved album with its photos and captions', () => {
    const list = withAlbumDescription();
    list.regularAlbumResultList[0].description = 'Neu im [i]Herbst[/i]';
    const captions = captionsResult([
      { id: '101', title: 'Profilbild' },
      { id: '102', title: 'Am See', description: 'kalt', hashtags: ['see'] },
    ]);

    const markdown = report(toAlbumZipRequest(albumRaw({ list, captions, profileText: PROFILE_TEXT }), DATE), 'profile.md');

    assert.ok(markdown.includes('### Motto\n\nCarpe diem\n\n### About\n\nHallo **ihr**\n'));
    assert.ok(markdown.includes(`### Fotos von uns\n\n- [TestOwner\\_Fotos-von-uns\\_01\\_${keyOf(1)}.jpg](Fotos-von-uns/TestOwner_Fotos-von-uns_01_${keyOf(1)}.jpg)\n`));
    assert.ok(markdown.includes(`### Aktuelles\n\nNeu im *Herbst*\n\n- [Am See](Aktuelles/TestOwner_Aktuelles_01_Am-See_${keyOf(2)}.jpg)\n  kalt\n  #see\n`));
    assert.ok(!markdown.includes('Lady'));
  });

  test('links titled photos with #, % and & percent-encoded', () => {
    const captions = captionsResult([{ id: '102', title: '#1 100% & mehr' }]);
    const request = toAlbumZipRequest(albumRaw({ captions }), DATE);
    const encoded = `Aktuelles/TestOwner_Aktuelles_01_%231-100%25-%26-mehr_${keyOf(2)}.jpg`;

    assert.ok(request.entries.some(({ name }) => name === `Aktuelles/TestOwner_Aktuelles_01_#1-100%-&-mehr_${keyOf(2)}.jpg`));
    assert.ok(report(request, 'profile.md').includes(`](${encoded})`));
    assert.ok(report(request, 'profile.html').includes(`<a href="${encoded}">`));
  });

  test('keeps only string hashtags', () => {
    const captions = captionsResult([{ id: '101', title: 'A', hashtags: ['see', { name: 'x' }, null] }]);

    const markdown = report(toAlbumZipRequest(albumRaw({ captions }), DATE), 'profile.md');

    assert.ok(markdown.includes('  #see\n'));
  });

  test('drops the placeholder title "..." and a caption that is no success', () => {
    const captions = captionsResult([{ id: '101', title: '...' }, { id: '102', notFound: true }]);

    const markdown = report(toAlbumZipRequest(albumRaw({ captions }), DATE), 'profile.md');

    assert.ok(!markdown.includes('[...]'));
    assert.ok(markdown.includes(`- [TestOwner\\_Aktuelles\\_01\\_${keyOf(2)}.jpg]`));
  });

  const missingTexts = {
    'a failed request': null,
    'an error answer': { __typename: 'ProfileByUserIdErrorResponse', errors: [{ __typename: 'AccessDenied', message: 'x' }] },
    'a BaseError description': { __typename: 'ProfileDescription', description: { __typename: 'AccessDenied', message: 'x' } },
  };
  for (const [name, profileText] of Object.entries(missingTexts)) {
    test(`${name} leaves out the profile text section and the fingerprint`, () => {
      const request = toAlbumZipRequest(albumRaw({ profileText, captions: null }), DATE);

      assert.ok(!report(request, 'profile.md').includes('## Profile text'));
      assert.ok(report(request, 'profile.md').includes('## Albums'));
      assert.ok(report(request, 'profile.html').includes('<h2>Albums</h2>'));
      assert.equal(request.profileTextHash, undefined);
    });
  }

  test('profileTextHash stays for the same text and changes with it', () => {
    const hash = (fields) => toAlbumZipRequest(albumRaw({ profileText: profileTextResult(fields) }), DATE).profileTextHash;

    assert.match(hash({ description: 'Hallo' }), /^[0-9a-f]{8}$/);
    assert.equal(hash({ description: 'Hallo' }), hash({ description: 'Hallo' }));
    assert.notEqual(hash({ description: 'Hallo' }), hash({ description: 'Hallo!' }));
    assert.notEqual(hash({ motto: 'Hallo' }), hash({ description: 'Hallo' }));
  });

  test('an album titled profile.md does not overwrite the report', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'], albums: [{ title: 'profile.md', ids: ['2'] }] }), DATE);

    assert.ok(!folders(request).includes('profile.md'));
  });
});

describe('toAlbumZipRequest with ClubMail', () => {
  const CLUBMAIL = { origin: ORIGIN, messages: [attachmentMessage('11', 'a1'), attachmentMessage('12', 'a2')] };
  const RESTRICTED_ONLY = { albums: [{ title: 'Lady', restricted: true, imageCount: 9 }] };

  test('appends the attachments after the albums in a ClubMail folder', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, CLUBMAIL);

    assert.deepEqual(names(request), [
      `Fotos-von-uns/TestOwner_Fotos-von-uns_01_${keyOf(1)}.jpg`,
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/TestOwner_ClubMail_02_a2.jpg',
    ]);
    assert.equal(request.clubMailFailed, false);
    assert.equal(request.clubMailReason, undefined);
  });

  test('carries the newest message id as lastMessageId', () => {
    assert.equal(toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, CLUBMAIL).lastMessageId, '12');
  });

  test('has no lastMessageId without messages or when ClubMail failed', () => {
    assert.equal('lastMessageId' in toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { origin: ORIGIN, messages: [] }), false);
    assert.equal('lastMessageId' in toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { failed: true }), false);
  });

  test('without a ClubMail result there is no clubMailReason', () => {
    assert.equal(toAlbumZipRequest(albumRaw(), DATE).clubMailReason, undefined);
  });

  test('without a conversation there is no ClubMail folder and no ClubMail line', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { origin: ORIGIN, messages: [] });

    assert.deepEqual(folders(request), ['Fotos-von-uns', 'Aktuelles']);
    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\n' }]);
  });

  test('a failed ClubMail fetch adds "ClubMail: unavailable" to skipped.txt and flags it', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { failed: true });

    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nClubMail: unavailable\n' }]);
    assert.equal(request.clubMailFailed, true);
  });

  test('a ClubMail failure reason goes into skipped.txt and is returned', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { failed: true, reason: 'HTTP 500' });

    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nClubMail: unavailable (HTTP 500)\n' }]);
    assert.equal(request.clubMailReason, 'HTTP 500');
  });

  test('a ClubMail failure without a reason writes no parentheses', () => {
    for (const clubMail of [{ failed: true }, { failed: true, reason: '' }]) {
      const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, clubMail);

      assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'ClubMail: unavailable\n' }]);
    }
  });

  test('a malformed ClubMail result counts as failed, without a reason', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { origin: ORIGIN });

    assert.equal(request.clubMailFailed, true);
    assert.equal(request.clubMailReason, undefined);
    assert.deepEqual(folders(request), ['Fotos-von-uns']);
    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'ClubMail: unavailable\n' }]);
  });

  test('a failed ClubMail fetch alone writes skipped.txt', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { failed: true });

    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'ClubMail: unavailable\n' }]);
  });

  test('only restricted albums with attachments give a ZIP with only ClubMail', () => {
    const request = toAlbumZipRequest(rawFor(RESTRICTED_ONLY), DATE, CLUBMAIL);

    assert.deepEqual(folders(request), ['ClubMail']);
  });

  test('throws NothingToDownloadError when albums and ClubMail are both empty', () => {
    assert.throws(() => toAlbumZipRequest(rawFor(RESTRICTED_ONLY), DATE, { origin: ORIGIN, messages: [] }), NothingToDownloadError);
    assert.throws(() => toAlbumZipRequest(rawFor(RESTRICTED_ONLY), DATE, { failed: true }), NothingToDownloadError);
  });

  test('an album failure stays AlbumApiError even with attachments', () => {
    assert.throws(() => toAlbumZipRequest({ failed: true }, DATE, CLUBMAIL), AlbumApiError);
  });

  test('adds ClubMail/conversation.md with every message to the reports', () => {
    const clubMail = { origin: ORIGIN, messages: [textMessage('10', { content: 'Hi' }), ...CLUBMAIL.messages] };
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, clubMail);

    const [transcript] = request.reports.filter(({ name }) => name === 'ClubMail/conversation.md');
    assert.match(transcript.text, /^# ClubMail with TestOwner\nExported 2026-10-08 17:45 · 3 messages\n/);
    assert.match(transcript.text, /Hi\n\n\*\*TestOwner\*\* · 21:11\n!\[attachment\]\(TestOwner_ClubMail_01_a1\.jpg\)\n/);
    assert.match(transcript.text, /!\[attachment\]\(TestOwner_ClubMail_02_a2\.jpg\)\n$/);
  });

  test('adds ClubMail/conversation.html with the same attachment files as the entries', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, CLUBMAIL);

    const [html] = request.reports.filter(({ name }) => name === 'ClubMail/conversation.html');
    const sources = [...html.text.matchAll(/<img src="([^"]+)"/g)].map(([, src]) => `ClubMail/${src}`);
    assert.deepEqual(sources, request.entries.map(({ name }) => name).filter((name) => name.startsWith('ClubMail/')));
    assert.match(html.text, /<h1>ClubMail with TestOwner<\/h1>\n<p>Exported 2026-10-08 17:45 · 2 messages<\/p>/);
  });

  test('a conversation without attachments still gets its transcript', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { origin: ORIGIN, messages: [textMessage('10')] });

    assert.deepEqual(withoutProfile(request.reports).map(({ name }) => name), ['ClubMail/conversation.md', 'ClubMail/conversation.html']);
  });

  test('a failed ClubMail fetch writes no transcript', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { failed: true });

    assert.deepEqual(withoutProfile(request.reports).map(({ name }) => name), ['skipped.txt']);
  });

  test('puts the user\'s own attachments into ClubMail/Own/', () => {
    const withOwn = { origin: ORIGIN, ownId: ME.id, messages: [attachmentMessage('11', 'a1'), attachmentMessage('12', 'a2', { from: ME })] };

    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, withOwn);

    assert.deepEqual(names(request).filter((name) => name.startsWith('ClubMail/')), [
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/Own/TestMe_ClubMail_01_a2.jpg',
    ]);
  });

  test('conversation.html links every attachment, including Own/, to its entry', () => {
    const withOwn = { origin: ORIGIN, ownId: ME.id, messages: [attachmentMessage('11', 'a1', { from: ME }), attachmentMessage('12', 'a2')] };

    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, withOwn);

    const [html] = request.reports.filter(({ name }) => name === 'ClubMail/conversation.html');
    const sources = [...html.text.matchAll(/<img src="([^"]+)"/g)].map(([, src]) => `ClubMail/${src}`);
    assert.deepEqual(sources, request.entries.map(({ name }) => name).filter((name) => name.startsWith('ClubMail/')));
    assert.ok(sources.includes('ClubMail/Own/TestMe_ClubMail_01_a1.jpg'));
  });

  test('an album titled ClubMail gets the folder ClubMail-2', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'ClubMail', ids: ['2'] }] }), DATE, CLUBMAIL);

    assert.deepEqual(folders(request), ['ClubMail-2', 'ClubMail']);
  });
});

describe('toAlbumZipRequest with videos', () => {
  const CLUBMAIL = { origin: ORIGIN, messages: [attachmentMessage('11', 'a1')] };
  const playable = (id) => ({ id, source: masterUrlOf(id), query: SIGNED_QUERY, signing: signingUrlOf(id) });
  const VIDEOS = { videos: [playable(VIDEO_ID_1), { id: VIDEO_ID_2, locked: true }] };

  test('puts the videos between the albums and ClubMail, in a Videos folder', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, CLUBMAIL, VIDEOS);

    assert.deepEqual(names(request), [
      `Fotos-von-uns/TestOwner_Fotos-von-uns_01_${keyOf(1)}.jpg`,
      `Videos/TestOwner_Videos_01_${VIDEO_ID_1}.mp4`,
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
    ]);
    assert.deepEqual(request.entries[1], {
      url: masterUrlOf(VIDEO_ID_1), name: `Videos/TestOwner_Videos_01_${VIDEO_ID_1}.mp4`, videoId: VIDEO_ID_1, hls: { query: SIGNED_QUERY, signing: signingUrlOf(VIDEO_ID_1) },
    });
  });

  test('lists videos without source in skipped.txt after the restricted albums', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { failed: true }, VIDEOS);

    assert.deepEqual(withoutProfile(request.reports), [{
      name: 'skipped.txt',
      text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nVideos: 1 not available (FSK18 locked)\nClubMail: unavailable\n',
    }]);
  });

  test('a failed video fetch adds a line to skipped.txt and keeps the ZIP', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, undefined, { failed: true, reason: 'HTTP 500' });

    assert.deepEqual(withoutProfile(request.reports), [{ name: 'skipped.txt', text: 'Videos: unavailable (HTTP 500)\n' }]);
    assert.equal(request.entries.length, 1);
  });

  test('flags a failed video fetch with its reason, and nothing when the videos were read', () => {
    const failed = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, undefined, { failed: true, reason: 'HTTP 500' });
    const read = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, undefined, VIDEOS);
    const notAsked = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE);

    assert.deepEqual([failed.videosFailed, failed.videosReason], [true, 'HTTP 500']);
    assert.deepEqual([read.videosFailed, read.videosReason], [false, undefined]);
    assert.deepEqual([notAsked.videosFailed, notAsked.videosReason], [false, undefined]);
  });

  test('a profile with only videos still gives a ZIP', () => {
    const request = toAlbumZipRequest(rawFor({}), DATE, undefined, VIDEOS);

    assert.deepEqual(names(request), [`Videos/TestOwner_Videos_01_${VIDEO_ID_1}.mp4`]);
  });

  test('an album titled Videos gets the folder Videos-2', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'Videos', ids: ['2'] }] }), DATE, undefined, VIDEOS);

    assert.deepEqual(folders(request), ['Videos-2', 'Videos']);
  });
});

describe('toClubMailZipRequest', () => {
  const RAW = {
    origin: ORIGIN,
    partnerId: PARTNER.id,
    messages: [textMessage('10', { from: ME, content: 'Hi' }), attachmentMessage('11', 'a1'), attachmentMessage('12', 'a2')],
  };

  test('names the ZIP <partner>_ClubMail.zip', () => {
    assert.equal(toClubMailZipRequest(RAW, DATE).zipName, 'TestOwner_ClubMail.zip');
  });

  test('carries the newest message id as lastMessageId', () => {
    assert.equal(toClubMailZipRequest(RAW, DATE).lastMessageId, '12');
  });

  test('takes the partner name even when the user wrote first', () => {
    assert.match(toClubMailZipRequest(RAW, DATE).zipName, /^TestOwner_/);
  });

  test('holds the attachments and both transcripts in ClubMail/ and nothing else', () => {
    const request = toClubMailZipRequest(RAW, DATE);

    assert.deepEqual(names(request), ['ClubMail/TestOwner_ClubMail_01_a1.jpg', 'ClubMail/TestOwner_ClubMail_02_a2.jpg']);
    assert.deepEqual(request.reports.map(({ name }) => name), ['ClubMail/conversation.md', 'ClubMail/conversation.html']);
    assert.match(request.reports[0].text, /^# ClubMail with TestOwner\nExported 2026-10-08 17:45 · 3 messages\n/);
  });

  test('own attachments go to ClubMail/Own/, the ZIP keeps the partner name', () => {
    const request = toClubMailZipRequest({ ...RAW, ownId: ME.id, messages: [...RAW.messages, attachmentMessage('13', 'a3', { from: ME })] }, DATE);

    assert.equal(request.zipName, 'TestOwner_ClubMail.zip');
    assert.deepEqual(names(request), [
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/TestOwner_ClubMail_02_a2.jpg',
      'ClubMail/Own/TestMe_ClubMail_01_a3.jpg',
    ]);
  });

  test('a conversation without attachments gives only the transcripts', () => {
    const request = toClubMailZipRequest({ ...RAW, messages: [textMessage('10')] }, DATE);

    assert.deepEqual(request.entries, []);
    assert.equal(request.reports.length, 2);
  });

  test('falls back to unknown when the partner wrote nothing', () => {
    const request = toClubMailZipRequest({ ...RAW, messages: [textMessage('10', { from: ME })] }, DATE);

    assert.equal(request.zipName, 'unknown_ClubMail.zip');
  });

  test('sanitises the partner name', () => {
    const messages = [textMessage('10', { from: { id: PARTNER.id, name: 'A/B: C' } })];

    assert.match(toClubMailZipRequest({ ...RAW, messages }, DATE).zipName, /^A_B_-C_ClubMail\.zip$/);
  });

  test('throws ClubMailApiError carrying the failure reason', () => {
    assert.throws(
      () => toClubMailZipRequest({ failed: true, reason: 'not your conversation' }, DATE),
      (error) => error instanceof ClubMailApiError && error.reason === 'not your conversation',
    );
  });

  test('throws ClubMailApiError without a reason for a failed or malformed result', () => {
    for (const raw of [{ failed: true }, { origin: ORIGIN }, null, undefined]) {
      assert.throws(
        () => toClubMailZipRequest(raw, DATE),
        (error) => error instanceof ClubMailApiError && error.reason === undefined,
      );
    }
  });

  test('throws NothingToDownloadError for an empty conversation', () => {
    assert.throws(() => toClubMailZipRequest({ origin: ORIGIN, messages: [] }, DATE), NothingToDownloadError);
  });
});

describe('skippedReport', () => {
  test('writes one line per album without a reason, with a trailing newline', () => {
    assert.equal(skippedReport([{ title: 'Lady', imageCount: 9 }]), 'Lady (9 photos)\n');
  });

  test('appends the restriction reason after a colon', () => {
    assert.equal(skippedReport([{ title: 'Lady', imageCount: 9, restrictionReason: 'NEEDS_PERMISSION_BY_OWNER' }]), 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\n');
  });

  for (const reason of ['INSUFFICIENT_MEMBERSHIP', 'NEEDS_PERMISSION_BY_OWNER', 'NEEDS_VERIFICATION', 'SOME_FUTURE_REASON']) {
    test(`writes the reason ${reason} raw`, () => {
      assert.equal(skippedReport([{ title: 'A', imageCount: 1, restrictionReason: reason }]), `A (1 photos): ${reason}\n`);
    });
  }

  for (const [label, restrictionReason] of [['missing', undefined], ['null', null], ['empty', ''], ['whitespace-only', '  ']]) {
    test(`a ${label} reason gives no suffix`, () => {
      assert.equal(skippedReport([{ title: 'A', imageCount: 1, restrictionReason }]), 'A (1 photos)\n');
    });
  }

  test('trims a padded reason', () => {
    assert.equal(skippedReport([{ title: 'A', imageCount: 1, restrictionReason: ' NEEDS_VERIFICATION ' }]), 'A (1 photos): NEEDS_VERIFICATION\n');
  });

  test('mixes lines with and without reason in API order', () => {
    const albums = [{ title: 'A', imageCount: 1, restrictionReason: 'NEEDS_VERIFICATION' }, { title: 'B', imageCount: 2 }];

    assert.equal(skippedReport(albums), 'A (1 photos): NEEDS_VERIFICATION\nB (2 photos)\n');
  });

  test('trims trailing spaces from the title without a reason', () => {
    assert.equal(skippedReport([{ title: 'Sie  ', imageCount: 1 }]), 'Sie (1 photos)\n');
  });

  test('returns empty for no albums', () => {
    assert.equal(skippedReport([]), '');
  });
});

describe('fetchProfileAlbums', () => {
  const USER_ID = '1000001';
  const TOKEN = 'test-token';
  const MAIN_CARD = { href: '/profile/fotoalbum/1000001.testowner.html', title: 'Fotos von uns' };
  const REGULAR_CARD = { href: '/profile/fotoalbum/1000001-201.testowner.html', title: 'Aktuelles' };
  const HTTP_OK = 200;
  const HTTP_UNAUTHORIZED = 401;
  const HTTP_FORBIDDEN = 403;
  const HTTP_SERVER_ERROR = 500;
  const LIST = listResult({ main: ['101'], albums: [{ id: '201', title: 'Aktuelles', ids: ['102'] }] });
  const SOURCES = sourcesResult([{ id: '101', uuid: testUuid(1) }, { id: '102', uuid: testUuid(2) }]);
  const CAPTIONS = captionsResult([{ id: '101', title: 'Am See' }, { id: '102', hashtags: ['sommer'] }]);
  const PROFILE_TEXT = profileTextResult({ description: 'Hallo' });
  const EXPECTED = {
    owner: 'TestOwner', mainAlbumTitle: 'Fotos von uns', list: LIST, sources: SOURCES, captions: CAPTIONS, profileText: PROFILE_TEXT,
  };
  const TOKEN_REQUEST = 'token';
  const originalFetch = globalThis.fetch;
  let fetchCalls;
  let responses;

  const jsonResponse = (body, status = HTTP_OK) => ({ ok: status === HTTP_OK, status, json: async () => body });
  const listBody = (list) => ({ data: { profileAlbum: { listByUserId: list } } });
  const sourcesBody = (itemList) => ({ data: { profileAlbum: { image: { source: { sourceByImageIdList: { itemList } } } } } });
  const captionsBody = (image) => ({ data: { profileAlbum: { image } } });
  const profileTextBody = (byUserId) => ({ data: { profileDescription: { byUserId } } });
  const callNamed = (name) => fetchCalls.find((call) => (call.body?.operationName ?? TOKEN_REQUEST) === name);

  // Mirror the constants inside fetchProfileAlbums, which cannot export them.
  const TITLE_POLL_MS = 100;
  const TITLE_STABLE_MS = 500;
  const TITLE_WAIT_MS = 3000;
  const MAX_TICKS = (2 * TITLE_WAIT_MS) / TITLE_POLL_MS;

  const PROFILE_PATH = '/profile/1000001.testowner.html';
  const MAIN_ALBUM_PATH = '/profile/fotoalbum/1000001.testowner.html';
  const REGULAR_ALBUM_PATH = '/profile/fotoalbum/1000001-201.testowner.html';
  const ALBUM_HEADLINE = '.profile-album-detail-page h2.profile-headline';

  // cards and headline: a value, or (now) => value for a page that is still rendering; the mocked clock starts at 0.
  // headline: the album page's headline text, null when it is not rendered (yet).
  function stubDocument({
    owner = ' TestOwner ', cards = [REGULAR_CARD, MAIN_CARD], pathname = PROFILE_PATH, headline = null,
  } = {}) {
    const anchor = ({ href, title }) => ({
      getAttribute: (name) => (name === 'href' ? href : null),
      querySelector: (selector) => (selector === '.title' ? { textContent: ` ${title} ` } : null),
    });
    const at = (value) => (typeof value === 'function' ? value(Date.now()) : value);
    const elements = {
      'h1.profile-base-info__user-name': () => (owner === null ? null : { textContent: owner }),
      [ALBUM_HEADLINE]: () => (at(headline) === null ? null : { textContent: ` ${at(headline)} ` }),
    };
    globalThis.document = {
      querySelector: (selector) => elements[selector]?.() ?? null,
      querySelectorAll: (selector) => (selector === 'a.profile-album-card__link' ? at(cards).map(anchor) : []),
    };
    globalThis.location = { pathname };
  }

  // Advances the mocked clock until the fetcher settles; resolves with its result and the elapsed time.
  async function run(promise) {
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });
    for (let ticks = 0; !settled; ticks++) {
      if (ticks > MAX_TICKS) throw new Error('fetchProfileAlbums did not settle');
      await new Promise(setImmediate);
      if (!settled) mock.timers.tick(TITLE_POLL_MS);
    }
    return { result: await promise, elapsed: Date.now() };
  }

  beforeEach(() => {
    fetchCalls = [];
    // Keyed by GraphQL operation; the album list, sources, captions and profile text requests overlap.
    responses = {
      [TOKEN_REQUEST]: () => jsonResponse({ status_code: HTTP_OK, content: { access_token: TOKEN }, error: null }),
      getProfileAlbumList: () => jsonResponse(listBody(LIST)),
      getProfileAlbumImageSources: () => jsonResponse(sourcesBody(SOURCES)),
      getProfileAlbumImageCaptions: () => jsonResponse(captionsBody(CAPTIONS)),
      getProfileDescriptionByUserId: () => jsonResponse(profileTextBody(PROFILE_TEXT)),
    };
    globalThis.fetch = async (url, options = {}) => {
      const body = options.body && JSON.parse(options.body);
      fetchCalls.push({ url, ...options, body });
      return responses[body?.operationName ?? TOKEN_REQUEST]();
    };
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    stubDocument();
  });

  afterEach(() => {
    mock.timers.reset();
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.location;
  });

  test('fetches the token, then album list, sources, captions and profile text', async () => {
    const { result } = await run(fetchProfileAlbums(USER_ID));

    assert.deepEqual(result, EXPECTED);
    const [token, list, sources, captions, text] = [
      TOKEN_REQUEST, 'getProfileAlbumList', 'getProfileAlbumImageSources', 'getProfileAlbumImageCaptions', 'getProfileDescriptionByUserId',
    ].map(callNamed);
    assert.equal(fetchCalls.length, 5);
    assert.equal(fetchCalls[0], token);
    assert.equal(token.url, '/webauth/access_token');
    assert.equal(token.credentials, 'include');
    for (const call of [list, sources, captions, text]) {
      assert.equal(call.url, 'https://apiv2.joyclub.com/graph/');
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.headers, { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });
    }
    assert.equal(list.body.operationName, 'getProfileAlbumList');
    assert.deepEqual(list.body.variables, { id: USER_ID });
    assert.equal(sources.body.operationName, 'getProfileAlbumImageSources');
    assert.deepEqual(sources.body.variables, { idList: ['101', '102'] });
    assert.deepEqual(captions.body.variables, { idList: ['101', '102'] });
    assert.deepEqual(text.body.variables, { userId: Number(USER_ID) });
  });

  test('asks for the profile text while the album list loads', async () => {
    let resolveList;
    responses.getProfileAlbumList = () => new Promise((resolve) => { resolveList = () => resolve(jsonResponse(listBody(LIST))); });
    const promise = fetchProfileAlbums(USER_ID);
    await new Promise(setImmediate);

    assert.ok(callNamed('getProfileDescriptionByUserId'));
    resolveList();
    assert.deepEqual((await run(promise)).result, EXPECTED);
  });

  test('asks for restrictionReason on restricted albums', async () => {
    await run(fetchProfileAlbums(USER_ID));

    assert.match(callNamed('getProfileAlbumList').body.query, /ProfileRestrictedRegularAlbum \{[^}]*restrictionReason/);
  });

  test('asks for the description of unrestricted albums and for photo hashtags', async () => {
    await run(fetchProfileAlbums(USER_ID));

    assert.match(callNamed('getProfileAlbumList').body.query, /ProfileUnrestrictedRegularAlbumInterface \{[^}]*description/);
    assert.match(callNamed('getProfileAlbumImageCaptions').body.query, /ProfileAlbumImageItemResultSuccess \{ title description \}/);
    assert.match(callNamed('getProfileAlbumImageCaptions').body.query, /ProfileAlbumImageHashtagsSuccessResult \{ hashtags \}/);
  });

  const optionalFailures = {
    'HTTP 500': () => jsonResponse({}, HTTP_SERVER_ERROR),
    'GraphQL errors array': () => jsonResponse({ errors: [{ message: 'denied' }], data: null }),
    'fetch throws': () => { throw new TypeError('Failed to fetch'); },
  };
  for (const [name, response] of Object.entries(optionalFailures)) {
    test(`captions ${name} → captions null, the rest stays`, async () => {
      responses.getProfileAlbumImageCaptions = response;

      assert.deepEqual((await run(fetchProfileAlbums(USER_ID))).result, { ...EXPECTED, captions: null });
    });

    test(`profile text ${name} → profileText null, the rest stays`, async () => {
      responses.getProfileDescriptionByUserId = response;

      assert.deepEqual((await run(fetchProfileAlbums(USER_ID))).result, { ...EXPECTED, profileText: null });
    });
  }

  test('every fetch gets an AbortSignal', async () => {
    await run(fetchProfileAlbums(USER_ID));

    assert.ok(fetchCalls.every((call) => call.signal instanceof AbortSignal));
  });

  test('reads the main album title only from the card without an album id', async () => {
    stubDocument({ cards: [REGULAR_CARD] });

    assert.equal((await run(fetchProfileAlbums(USER_ID))).result.mainAlbumTitle, '');
  });

  test('waits for a late main card and its final title', async () => {
    const CARD_APPEARS_MS = 1000;
    const DEFAULT_LABEL_MS = 150;
    stubDocument({
      cards: (now) => {
        if (now < CARD_APPEARS_MS) return [];
        const title = now < CARD_APPEARS_MS + DEFAULT_LABEL_MS ? 'Fotos von mir' : 'Fotos von uns';
        return [REGULAR_CARD, { ...MAIN_CARD, title }];
      },
    });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= CARD_APPEARS_MS + DEFAULT_LABEL_MS + TITLE_STABLE_MS && elapsed < TITLE_WAIT_MS);
  });

  test('waits for the title while the API calls run', async () => {
    const TOKEN_DELAY_MS = 1000;
    const token = responses[TOKEN_REQUEST];
    responses[TOKEN_REQUEST] = () => new Promise((resolve) => setTimeout(() => resolve(token()), TOKEN_DELAY_MS));

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= TOKEN_DELAY_MS && elapsed < TOKEN_DELAY_MS + TITLE_STABLE_MS);
  });

  test('keeps waiting for the title past the wait limit while the API calls run', async () => {
    const TOKEN_DELAY_MS = TITLE_WAIT_MS + 1000;
    const CARD_APPEARS_MS = TITLE_WAIT_MS + 500;
    const token = responses[TOKEN_REQUEST];
    responses[TOKEN_REQUEST] = () => new Promise((resolve) => setTimeout(() => resolve(token()), TOKEN_DELAY_MS));
    stubDocument({ cards: (now) => (now < CARD_APPEARS_MS ? [] : [REGULAR_CARD, MAIN_CARD]) });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= CARD_APPEARS_MS + TITLE_STABLE_MS);
  });

  test('a rendered page answers after the title has been stable', async () => {
    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= TITLE_STABLE_MS && elapsed < TITLE_STABLE_MS + 2 * TITLE_POLL_MS);
  });

  test('a main album page takes its headline at once', async () => {
    stubDocument({ pathname: MAIN_ALBUM_PATH, cards: [], headline: 'Fotos von uns' });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed < TITLE_POLL_MS);
  });

  test('a main album page waits for a late headline while the API calls run', async () => {
    const TOKEN_DELAY_MS = 1000;
    const HEADLINE_APPEARS_MS = 400;
    const token = responses[TOKEN_REQUEST];
    responses[TOKEN_REQUEST] = () => new Promise((resolve) => setTimeout(() => resolve(token()), TOKEN_DELAY_MS));
    stubDocument({ pathname: MAIN_ALBUM_PATH, cards: [], headline: (now) => (now < HEADLINE_APPEARS_MS ? null : 'Fotos von uns') });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= TOKEN_DELAY_MS && elapsed < TOKEN_DELAY_MS + TITLE_POLL_MS);
  });

  test('a main album page without headline gives an empty title once the API calls are done', async () => {
    stubDocument({ pathname: MAIN_ALBUM_PATH, cards: [] });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, '');
    assert.ok(elapsed <= TITLE_POLL_MS);
  });

  test('a regular album page gives an empty main title at once, not its own headline', async () => {
    stubDocument({ pathname: REGULAR_ALBUM_PATH, cards: [], headline: 'Aktuelles' });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, '');
    assert.ok(elapsed < TITLE_POLL_MS);
  });

  test('an album overview page waits for the main card like the profile page', async () => {
    stubDocument({ pathname: '/profile/fotos/1000001.testowner.html', headline: 'Fotos' });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= TITLE_STABLE_MS);
  });

  test('gives up on a profile page without album cards after the wait limit', async () => {
    stubDocument({ cards: [] });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, '');
    assert.ok(elapsed >= TITLE_WAIT_MS && elapsed < TITLE_WAIT_MS + 2 * TITLE_POLL_MS);
  });

  test('a title still changing at the wait limit gives an empty title', async () => {
    const FLIP_MS = 300;
    stubDocument({ cards: (now) => [{ ...MAIN_CARD, title: Math.floor(now / FLIP_MS) % 2 ? 'A' : 'B' }] });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, '');
    assert.ok(elapsed >= TITLE_WAIT_MS);
  });

  test('a missing owner heading gives an empty owner', async () => {
    stubDocument({ owner: null });

    assert.equal((await run(fetchProfileAlbums(USER_ID))).result.owner, '');
  });

  test('skips the sources and captions calls when no album has ids', async () => {
    const empty = listResult({ albums: [{ id: '202', title: 'Lady', restricted: true, imageCount: 9 }] });
    responses.getProfileAlbumList = () => jsonResponse(listBody(empty));

    const { result } = await run(fetchProfileAlbums(USER_ID));

    assert.deepEqual(fetchCalls.map((call) => call.body?.operationName ?? TOKEN_REQUEST).sort(), [
      'getProfileAlbumList', 'getProfileDescriptionByUserId', TOKEN_REQUEST,
    ]);
    assert.deepEqual(result.sources, []);
    assert.equal(result.captions, null);
    assert.deepEqual(result.list, empty);
  });

  const failures = {
    'token HTTP 403': [TOKEN_REQUEST, () => jsonResponse({}, HTTP_FORBIDDEN)],
    'token JSON without access_token': [TOKEN_REQUEST, () => jsonResponse({ status_code: HTTP_UNAUTHORIZED, content: null, error: 'x' })],
    'list HTTP 500': ['getProfileAlbumList', () => jsonResponse({}, HTTP_SERVER_ERROR)],
    'GraphQL errors array': ['getProfileAlbumList', () => jsonResponse({ errors: [{ message: 'denied' }], data: null })],
    'sources fetch throws': ['getProfileAlbumImageSources', () => { throw new TypeError('Failed to fetch'); }],
    'timeout abort': ['getProfileAlbumImageSources', () => { throw new DOMException('signal timed out', 'TimeoutError'); }],
  };
  for (const [name, [operation, response]] of Object.entries(failures)) {
    test(`${name} → { failed: true }`, async () => {
      responses[operation] = response;

      assert.deepEqual((await run(fetchProfileAlbums(USER_ID))).result, { failed: true });
    });
  }

  test('a missing token fails without waiting for the main album title', async () => {
    responses[TOKEN_REQUEST] = failures['token JSON without access_token'][1];
    stubDocument({ cards: [] });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.deepEqual(result, { failed: true });
    assert.ok(elapsed < TITLE_STABLE_MS);
  });

  test('stays self-contained when serialised like executeScript does', async () => {
    const serialised = new Function(`return (${fetchProfileAlbums.toString()})`)();

    assert.deepEqual((await run(serialised(USER_ID))).result, EXPECTED);
  });
});
