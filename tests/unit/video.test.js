import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEOS_FOLDER, fetchProfileVideos, signedQueryOf, toVideoEntries, unsupportedVideosLine } from '../../lib/video.js';
import {
  JOYCLUB_ORIGIN, SIGNED_QUERY, VIDEO_ID_1, VIDEO_ID_2, VIDEO_TITLE, dataAnswer, guidOf, listAnswer, masterUrlOf, signedAnswer, signingUrlOf,
  videoItem,
} from '../fixtures/video-api.js';

const USER_ID = '1000001';
const CACHE_KILLER = 'ck-123';
const HTTP_OK = 200;
const HTTP_SERVER_ERROR = 500;

describe('fetchProfileVideos', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls;
  let answers;

  const jsonResponse = (body, status = HTTP_OK) => ({ ok: status === HTTP_OK, status, json: async () => body });
  const pathOf = (url) => new URL(url, JOYCLUB_ORIGIN).pathname;

  beforeEach(() => {
    fetchCalls = [];
    answers = {
      '/video/lightbox/list': () => jsonResponse(listAnswer([VIDEO_ID_1, VIDEO_ID_2])),
      '/video/lightbox/data': () => jsonResponse(dataAnswer([videoItem(VIDEO_ID_1), videoItem(VIDEO_ID_2)])),
      '/aws/aws_signed_cookies': () => jsonResponse(signedAnswer()),
    };
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, ...options });
      const answer = answers[pathOf(url)];
      if (!answer) throw new TypeError('Failed to fetch');
      return answer();
    };
    globalThis.document = { body: { dataset: { cacheKiller: CACHE_KILLER } } };
    globalThis.location = { origin: JOYCLUB_ORIGIN };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.location;
  });

  test('returns every video with its master playlist, signed query and title, in list order', async () => {
    assert.deepEqual(await fetchProfileVideos(USER_ID), {
      videos: [
        { id: VIDEO_ID_1, source: masterUrlOf(VIDEO_ID_1), query: SIGNED_QUERY, signing: signingUrlOf(VIDEO_ID_1), title: VIDEO_TITLE },
        { id: VIDEO_ID_2, source: masterUrlOf(VIDEO_ID_2), query: SIGNED_QUERY, signing: signingUrlOf(VIDEO_ID_2), title: VIDEO_TITLE },
      ],
    });
  });

  test('leaves the title out when media_title is empty or missing', async () => {
    const untitled = { ...videoItem(VIDEO_ID_2) };
    delete untitled.media_title;
    answers['/video/lightbox/data'] = () => jsonResponse(dataAnswer([videoItem(VIDEO_ID_1, { title: '' }), untitled]));

    const { videos } = await fetchProfileVideos(USER_ID);

    assert.deepEqual(videos.map((video) => 'title' in video), [false, false]);
  });

  test('posts list and data with cache_killer and the numeric user id', async () => {
    await fetchProfileVideos(USER_ID);

    const [list, data] = fetchCalls;
    assert.equal(list.method, 'POST');
    assert.equal(list.body.get('cache_killer'), CACHE_KILLER);
    assert.deepEqual(JSON.parse(list.body.get('data')), { media_set_id: 0, media_source: 4, media_user_id: Number(USER_ID) });
    assert.deepEqual(JSON.parse(data.body.get('data')).media_id_list, [Number(VIDEO_ID_1), Number(VIDEO_ID_2)]);
  });

  test('asks for the signed values with the video\'s own payload and never calls track/watch', async () => {
    await fetchProfileVideos(USER_ID);

    const signed = fetchCalls.filter(({ url }) => pathOf(url) === '/aws/aws_signed_cookies');
    assert.equal(signed.length, 2);
    assert.equal(signed[0].url, signingUrlOf(VIDEO_ID_1));
    const params = new URL(signed[0].url).searchParams;
    assert.equal(params.get('mode'), 'user');
    assert.equal(JSON.parse(params.get('payload')).guid, guidOf(VIDEO_ID_1));
    assert.equal(fetchCalls.some(({ url }) => url.includes('track')), false);
  });

  test('a locked FSK18 session keeps the video without source, marked locked', async () => {
    answers['/video/lightbox/data'] = () => jsonResponse(dataAnswer([videoItem(VIDEO_ID_1, { source: false }), videoItem(VIDEO_ID_2)]));

    const { videos } = await fetchProfileVideos(USER_ID);

    assert.deepEqual(videos[0], { id: VIDEO_ID_1, locked: true });
    assert.equal(videos[1].source, masterUrlOf(VIDEO_ID_2));
  });

  test('a video missing from the data answer has no source and is not locked', async () => {
    answers['/video/lightbox/data'] = () => jsonResponse(dataAnswer([videoItem(VIDEO_ID_2)]));

    assert.deepEqual((await fetchProfileVideos(USER_ID)).videos[0], { id: VIDEO_ID_1 });
  });

  test('a failing signed-values request drops only that video\'s source', async () => {
    answers['/aws/aws_signed_cookies'] = () => jsonResponse({}, HTTP_SERVER_ERROR);

    assert.deepEqual((await fetchProfileVideos(USER_ID)).videos, [{ id: VIDEO_ID_1 }, { id: VIDEO_ID_2 }]);
  });

  test('signed values with a value missing drop that video\'s source', async () => {
    const partial = { ...signedAnswer().content.cookie_list };
    delete partial['CloudFront-Signature'];
    answers['/aws/aws_signed_cookies'] = () => jsonResponse({ content: { cookie_list: partial } });

    assert.deepEqual((await fetchProfileVideos(USER_ID)).videos, [{ id: VIDEO_ID_1 }, { id: VIDEO_ID_2 }]);
  });

  test('a profile without videos asks for no data', async () => {
    answers['/video/lightbox/list'] = () => jsonResponse(listAnswer([]));

    assert.deepEqual(await fetchProfileVideos(USER_ID), { videos: [] });
    assert.equal(fetchCalls.length, 1);
  });

  test('without cache_killer → no session, no request', async () => {
    globalThis.document = { body: { dataset: {} } };

    assert.deepEqual(await fetchProfileVideos(USER_ID), { failed: true, reason: 'no session' });
    assert.equal(fetchCalls.length, 0);
  });

  test('HTTP error on the list → its status as reason', async () => {
    answers['/video/lightbox/list'] = () => jsonResponse({}, HTTP_SERVER_ERROR);

    assert.deepEqual(await fetchProfileVideos(USER_ID), { failed: true, reason: 'HTTP 500' });
  });

  test('a list without media_key_list → bad response', async () => {
    answers['/video/lightbox/list'] = () => jsonResponse({ content: {} });

    assert.deepEqual(await fetchProfileVideos(USER_ID), { failed: true, reason: 'bad response' });
  });

  test('a network error → network error', async () => {
    answers['/video/lightbox/list'] = () => {
      throw new TypeError('Failed to fetch');
    };

    assert.deepEqual(await fetchProfileVideos(USER_ID), { failed: true, reason: 'network error' });
  });

  test('stays self-contained when serialised like executeScript does', async () => {
    const serialised = new Function(`return (${fetchProfileVideos.toString()})`)();

    assert.deepEqual(await serialised(USER_ID), await fetchProfileVideos(USER_ID));
  });

  test('a timeout → timeout', async () => {
    answers['/video/lightbox/data'] = () => {
      throw new DOMException('timed out', 'TimeoutError');
    };

    assert.deepEqual(await fetchProfileVideos(USER_ID), { failed: true, reason: 'timeout' });
  });
});

describe('toVideoEntries', () => {
  const OWNER = 'TestOwner';
  const playable = (id) => ({ id, source: masterUrlOf(id), query: SIGNED_QUERY, signing: signingUrlOf(id) });
  const hlsOf = (id) => ({ query: SIGNED_QUERY, signing: signingUrlOf(id) });

  test('names each video by its list position and id, with the signed query and re-sign URL beside the URL', () => {
    assert.deepEqual(toVideoEntries({ videos: [playable(VIDEO_ID_1), playable(VIDEO_ID_2)] }, OWNER), {
      entries: [
        { url: masterUrlOf(VIDEO_ID_1), name: `Videos/TestOwner_Videos_01_${VIDEO_ID_1}.mp4`, videoId: VIDEO_ID_1, hls: hlsOf(VIDEO_ID_1) },
        { url: masterUrlOf(VIDEO_ID_2), name: `Videos/TestOwner_Videos_02_${VIDEO_ID_2}.mp4`, videoId: VIDEO_ID_2, hls: hlsOf(VIDEO_ID_2) },
      ],
      skipped: '',
    });
  });

  test('a video without source leaves a gap and a skipped line', () => {
    const { entries, skipped } = toVideoEntries({ videos: [{ id: VIDEO_ID_1, locked: true }, playable(VIDEO_ID_2)] }, OWNER);

    assert.deepEqual(entries.map(({ name }) => name), [`Videos/TestOwner_Videos_02_${VIDEO_ID_2}.mp4`]);
    assert.equal(skipped, 'Videos: 1 not available (FSK18 locked)\n');
  });

  test('locked and otherwise unavailable videos get one line each', () => {
    const { skipped } = toVideoEntries({ videos: [{ id: '1', locked: true }, { id: '2', locked: true }, { id: '3' }] }, OWNER);

    assert.equal(skipped, 'Videos: 2 not available (FSK18 locked)\nVideos: 1 not available\n');
  });

  test('a failed fetch → no entries, an unavailable line with the reason', () => {
    assert.deepEqual(toVideoEntries({ failed: true, reason: 'HTTP 500' }, OWNER), { entries: [], skipped: 'Videos: unavailable (HTTP 500)\n' });
    assert.equal(toVideoEntries({ failed: true }, OWNER).skipped, 'Videos: unavailable\n');
  });

  test('no videos asked for, or none there → nothing', () => {
    assert.deepEqual(toVideoEntries(undefined, OWNER), { entries: [], skipped: '' });
    assert.deepEqual(toVideoEntries({ videos: [] }, OWNER), { entries: [], skipped: '' });
  });

  test('puts a usable title before the id, sanitised like a photo title', () => {
    const { entries } = toVideoEntries({ videos: [{ ...playable(VIDEO_ID_1), title: 'Am Strand: Teil 1' }] }, OWNER);

    assert.equal(entries[0].name, `Videos/TestOwner_Videos_01_Am-Strand_-Teil-1_${VIDEO_ID_1}.mp4`);
    assert.equal(entries[0].videoId, VIDEO_ID_1);
  });

  test('a placeholder or blank title keeps the name without title', () => {
    const { entries } = toVideoEntries({ videos: [{ ...playable(VIDEO_ID_1), title: '...' }, { ...playable(VIDEO_ID_2), title: '  ' }] }, OWNER);

    assert.deepEqual(entries.map(({ name }) => name), [
      `Videos/TestOwner_Videos_01_${VIDEO_ID_1}.mp4`,
      `Videos/TestOwner_Videos_02_${VIDEO_ID_2}.mp4`,
    ]);
  });

  test('uses the given folder', () => {
    assert.equal(toVideoEntries({ videos: [playable(VIDEO_ID_1)] }, OWNER, 'Clips').entries[0].name, `Clips/TestOwner_Clips_01_${VIDEO_ID_1}.mp4`);
    assert.equal(VIDEOS_FOLDER, 'Videos');
  });
});

describe('signedQueryOf', () => {
  test('turns the three CloudFront cookies into the signed-URL query', () => {
    assert.equal(signedQueryOf(signedAnswer()), SIGNED_QUERY);
  });

  test('is empty when a value is missing or the answer is no success', () => {
    assert.equal(signedQueryOf(signedAnswer({ 'CloudFront-Policy': 'p', 'CloudFront-Signature': 's' })), '');
    assert.equal(signedQueryOf({ status_code: 500 }), '');
    assert.equal(signedQueryOf(null), '');
  });
});

describe('unsupportedVideosLine', () => {
  test('counts the videos and names the reason', () => {
    assert.equal(unsupportedVideosLine(2, 'encrypted'), 'Videos: 2 not supported (encrypted)\n');
  });
});
