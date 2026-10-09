import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlbumApiError,
  fetchProfileAlbums,
  NothingToDownloadError,
  photoKey,
  profileUserId,
  toAlbumZipRequest,
  skippedReport,
  missingReport,
} from '../../lib/profile.js';
import { IMAGE_BASE, albumRaw, listResult, sourcesResult, testUuid } from '../fixtures/album-api.js';
import { ORIGIN, attachmentMessage } from '../fixtures/clubmail-api.js';

const DATE = new Date(2026, 9, 8, 17, 45, 0);
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
  });

  test('without a conversation there is no ClubMail folder and no ClubMail line', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { origin: ORIGIN, messages: [] });

    assert.deepEqual(folders(request), ['Fotos-von-uns', 'Aktuelles']);
    assert.deepEqual(request.reports, [{ name: 'skipped.txt', text: 'Lady (9 photos)\n' }]);
  });

  test('a failed ClubMail fetch adds "ClubMail: unavailable" to skipped.txt and flags it', () => {
    const request = toAlbumZipRequest(albumRaw(), DATE, { failed: true });

    assert.deepEqual(request.reports, [{ name: 'skipped.txt', text: 'Lady (9 photos)\nClubMail: unavailable\n' }]);
    assert.equal(request.clubMailFailed, true);
  });

  test('a malformed ClubMail result counts as failed', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { origin: ORIGIN });

    assert.equal(request.clubMailFailed, true);
    assert.deepEqual(folders(request), ['Fotos-von-uns']);
  });

  test('a failed ClubMail fetch alone writes skipped.txt', () => {
    const request = toAlbumZipRequest(rawFor({ main: ['1'] }), DATE, { failed: true });

    assert.deepEqual(request.reports, [{ name: 'skipped.txt', text: 'ClubMail: unavailable\n' }]);
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

  test('an album titled ClubMail gets the folder ClubMail-2', () => {
    const request = toAlbumZipRequest(rawFor({ albums: [{ title: 'ClubMail', ids: ['2'] }] }), DATE, CLUBMAIL);

    assert.deepEqual(folders(request), ['ClubMail-2', 'ClubMail']);
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
  const originalFetch = globalThis.fetch;
  let fetchCalls;
  let responses;

  const jsonResponse = (body, status = HTTP_OK) => ({ ok: status === HTTP_OK, status, json: async () => body });
  const listBody = (list) => ({ data: { profileAlbum: { listByUserId: list } } });
  const sourcesBody = (itemList) => ({ data: { profileAlbum: { image: { source: { sourceByImageIdList: { itemList } } } } } });

  // Mirror the constants inside fetchProfileAlbums, which cannot export them.
  const TITLE_POLL_MS = 100;
  const TITLE_STABLE_MS = 500;
  const TITLE_WAIT_MS = 3000;
  const MAX_TICKS = (2 * TITLE_WAIT_MS) / TITLE_POLL_MS;

  // cards: an array, or (now) => array for a page that is still rendering; the mocked clock starts at 0.
  function stubDocument({ owner = ' TestOwner ', cards = [REGULAR_CARD, MAIN_CARD] } = {}) {
    const anchor = ({ href, title }) => ({
      getAttribute: (name) => (name === 'href' ? href : null),
      querySelector: (selector) => (selector === '.title' ? { textContent: ` ${title} ` } : null),
    });
    const cardsAt = typeof cards === 'function' ? cards : () => cards;
    globalThis.document = {
      querySelector: (selector) => (selector === 'h1.profile-base-info__user-name' && owner !== null ? { textContent: owner } : null),
      querySelectorAll: (selector) => (selector === 'a.profile-album-card__link' ? cardsAt(Date.now()).map(anchor) : []),
    };
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
    responses = [
      () => jsonResponse({ status_code: HTTP_OK, content: { access_token: TOKEN }, error: null }),
      () => jsonResponse(listBody(LIST)),
      () => jsonResponse(sourcesBody(SOURCES)),
    ];
    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, ...options, body: options.body && JSON.parse(options.body) });
      return responses[fetchCalls.length - 1]();
    };
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    stubDocument();
  });

  afterEach(() => {
    mock.timers.reset();
    globalThis.fetch = originalFetch;
    delete globalThis.document;
  });

  test('fetches token, album list and image sources in order', async () => {
    const { result } = await run(fetchProfileAlbums(USER_ID));

    assert.deepEqual(result, { owner: 'TestOwner', mainAlbumTitle: 'Fotos von uns', list: LIST, sources: SOURCES });
    const [token, list, sources] = fetchCalls;
    assert.equal(fetchCalls.length, 3);
    assert.equal(token.url, '/webauth/access_token');
    assert.equal(token.credentials, 'include');
    for (const call of [list, sources]) {
      assert.equal(call.url, 'https://apiv2.joyclub.com/graph/');
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.headers, { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });
    }
    assert.equal(list.body.operationName, 'getProfileAlbumList');
    assert.deepEqual(list.body.variables, { id: USER_ID });
    assert.equal(sources.body.operationName, 'getProfileAlbumImageSources');
    assert.deepEqual(sources.body.variables, { idList: ['101', '102'] });
  });

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
    const token = responses[0];
    responses[0] = () => new Promise((resolve) => setTimeout(() => resolve(token()), TOKEN_DELAY_MS));

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(result.mainAlbumTitle, 'Fotos von uns');
    assert.ok(elapsed >= TOKEN_DELAY_MS && elapsed < TOKEN_DELAY_MS + TITLE_STABLE_MS);
  });

  test('keeps waiting for the title past the wait limit while the API calls run', async () => {
    const TOKEN_DELAY_MS = TITLE_WAIT_MS + 1000;
    const CARD_APPEARS_MS = TITLE_WAIT_MS + 500;
    const token = responses[0];
    responses[0] = () => new Promise((resolve) => setTimeout(() => resolve(token()), TOKEN_DELAY_MS));
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

  test('gives up on a page without album cards after the wait limit', async () => {
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

  test('skips the sources call when no album has ids', async () => {
    const empty = listResult({ albums: [{ id: '202', title: 'Lady', restricted: true, imageCount: 9 }] });
    responses[1] = () => jsonResponse(listBody(empty));

    const { result } = await run(fetchProfileAlbums(USER_ID));

    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.list, empty);
  });

  const failures = {
    'token HTTP 403': [0, () => jsonResponse({}, HTTP_FORBIDDEN)],
    'token JSON without access_token': [0, () => jsonResponse({ status_code: HTTP_UNAUTHORIZED, content: null, error: 'x' })],
    'list HTTP 500': [1, () => jsonResponse({}, HTTP_SERVER_ERROR)],
    'GraphQL errors array': [1, () => jsonResponse({ errors: [{ message: 'denied' }], data: null })],
    'sources fetch throws': [2, () => { throw new TypeError('Failed to fetch'); }],
    'timeout abort': [2, () => { throw new DOMException('signal timed out', 'TimeoutError'); }],
  };
  for (const [name, [index, response]] of Object.entries(failures)) {
    test(`${name} → { failed: true }`, async () => {
      responses[index] = response;

      assert.deepEqual((await run(fetchProfileAlbums(USER_ID))).result, { failed: true });
    });
  }

  test('a missing token fails without waiting for the main album title', async () => {
    responses[0] = failures['token JSON without access_token'][1];
    stubDocument({ cards: [] });

    const { result, elapsed } = await run(fetchProfileAlbums(USER_ID));

    assert.deepEqual(result, { failed: true });
    assert.ok(elapsed < TITLE_STABLE_MS);
  });

  test('stays self-contained when serialised like executeScript does', async () => {
    const serialised = new Function(`return (${fetchProfileAlbums.toString()})`)();

    assert.deepEqual((await run(serialised(USER_ID))).result, { owner: 'TestOwner', mainAlbumTitle: 'Fotos von uns', list: LIST, sources: SOURCES });
  });
});
