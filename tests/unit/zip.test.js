import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import muxjs from 'mux.js';
import { FETCH_CONCURRENCY, FETCH_RETRIES, RETRY_BASE_DELAY_MS, buildZip, isRetryable, mapWithLimit } from '../../lib/zip.js';
import { MISSING_REPORT_NAME, SKIPPED_REPORT_NAME } from '../../lib/profile.js';
import { ZIP_LOG_NAME } from '../../lib/log.js';
import {
  BYTERANGE_FILE, BYTERANGE_MEDIA_PLAYLIST, ENCRYPTED_MEDIA_PLAYLIST, FMP4_FILES, FMP4_MEDIA_PLAYLIST, MEDIA_PLAYLIST,
  SEGMENT_NAMES, SIGNED_QUERY, VIDEO_ID_1, byteRangeBytes, fmp4Bytes, masterPlaylist, masterUrlOf, segmentBytes, signedAnswer,
  signingUrlOf, variantNameOf,
} from '../fixtures/video-api.js';

const URL_A = 'https://img.example/a.jpg';
const URL_B = 'https://img.example/b.jpg';
const BYTES_A = [1, 2, 3];
const BYTES_B = [4, 5];
const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAVAILABLE = 503;
const MAX_ATTEMPTS = FETCH_RETRIES + 1;

const ENTRIES = [
  { url: URL_A, name: 'Owner_01_a.jpg' },
  { url: URL_B, name: 'Owner_02_b.jpg' },
];
const SKIPPED_TEXT = 'Lady (9 photos)\n';
const REPORTS = [{ name: SKIPPED_REPORT_NAME, text: SKIPPED_TEXT }];

function okResponse(bytes) {
  return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

function stubFetch(responses) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const response = responses[url];
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetch, calls };
}

// Answers each URL from its queue, one item per attempt; the last item repeats.
function stubFetchSequence(sequences) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const queue = sequences[url];
    const response = queue.length > 1 ? queue.shift() : queue[0];
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetch, calls };
}

function recordDelay() {
  const waits = [];
  return { delay: async (ms) => { waits.push(ms); }, waits };
}

const noDelay = async () => {};

async function readZip(blob) {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

function tick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('mapWithLimit', () => {
  it('keeps input order when tasks resolve out of order', async () => {
    const delays = [30, 10, 20];
    const results = await mapWithLimit(delays, delays.length, async (ms) => {
      await tick(ms);
      return ms;
    });
    assert.deepEqual(results, delays);
  });

  it('never runs more than limit tasks at once', async () => {
    const limit = 2;
    let inFlight = 0;
    let peak = 0;
    await mapWithLimit([1, 2, 3, 4, 5, 6], limit, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(1);
      inFlight--;
    });
    assert.equal(peak, limit);
  });

  it('handles a limit larger than the item count', async () => {
    const results = await mapWithLimit([1, 2], 10, async (n) => n * 2);
    assert.deepEqual(results, [2, 4]);
  });

  it('returns [] for an empty list', async () => {
    assert.deepEqual(await mapWithLimit([], 3, async () => 1), []);
  });
});

describe('buildZip', () => {
  it('zips every fetched photo under its name', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const { blob, added, missing } = await buildZip(ENTRIES, { JSZip, fetch });
    assert.equal(added, 2);
    assert.deepEqual(missing, []);
    assert.equal(blob.type, 'application/zip');
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', 'Owner_02_b.jpg']);
    assert.deepEqual([...await zip.file('Owner_01_a.jpg').async('uint8array')], BYTES_A);
    assert.deepEqual([...await zip.file('Owner_02_b.jpg').async('uint8array')], BYTES_B);
  });

  for (const [label, failure] of [
    ['HTTP 404', { ok: false, status: HTTP_NOT_FOUND }],
    ['a thrown fetch', new Error('network down')],
  ]) {
    it(`lists the URL in missing.txt after ${label}`, async () => {
      const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: failure });
      const { blob, added, missing } = await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay });
      assert.equal(added, 1);
      assert.deepEqual(missing, [URL_B]);
      const zip = await readZip(blob);
      assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', ZIP_LOG_NAME, MISSING_REPORT_NAME]);
      assert.equal(await zip.file(MISSING_REPORT_NAME).async('string'), `${URL_B}\n`);
    });
  }

  it('returns no blob when every fetch fails', async () => {
    const { fetch } = stubFetch({ [URL_A]: new Error('x'), [URL_B]: { ok: false, status: HTTP_NOT_FOUND } });
    const { blob, added, missing } = await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay });
    assert.equal(blob, null);
    assert.equal(added, 0);
    assert.deepEqual(missing, [URL_A, URL_B]);
  });

  it('returns no blob for zero entries', async () => {
    const { fetch, calls } = stubFetch({});
    const { blob, added, missing } = await buildZip([], { JSZip, fetch });
    assert.equal(blob, null);
    assert.equal(added, 0);
    assert.deepEqual(missing, []);
    assert.equal(calls.length, 0);
  });

  it('fetches with credentials and an abort signal', async () => {
    const { fetch, calls } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    await buildZip(ENTRIES, { JSZip, fetch });
    assert.deepEqual(calls.map((c) => c.url), [URL_A, URL_B]);
    for (const { options } of calls) {
      assert.equal(options.credentials, 'include');
      assert.ok(options.signal instanceof AbortSignal);
    }
  });

  it('fetches at most FETCH_CONCURRENCY photos at once by default', async () => {
    const entries = Array.from({ length: FETCH_CONCURRENCY + 3 }, (_, i) => ({
      url: `https://img.example/${i}.jpg`,
      name: `${i}.jpg`,
    }));
    let inFlight = 0;
    let peak = 0;
    const fetch = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(1);
      inFlight--;
      return okResponse(BYTES_A);
    };
    const { added } = await buildZip(entries, { JSZip, fetch });
    assert.equal(added, entries.length);
    assert.equal(peak, FETCH_CONCURRENCY);
  });

  it('zips only the reports for zero entries with reports', async () => {
    const { fetch, calls } = stubFetch({});
    const { blob, added, missing } = await buildZip([], { JSZip, fetch, reports: REPORTS });
    assert.equal(added, 0);
    assert.deepEqual(missing, []);
    assert.equal(calls.length, 0);
    assert.deepEqual(Object.keys((await readZip(blob)).files), [SKIPPED_REPORT_NAME]);
  });

  it('writes a report next to the photos', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', 'Owner_02_b.jpg', SKIPPED_REPORT_NAME]);
    assert.equal(await zip.file(SKIPPED_REPORT_NAME).async('string'), SKIPPED_TEXT);
  });

  it('writes reports, missing.txt and log.txt together', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: new Error('x') });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS, delay: noDelay });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', ZIP_LOG_NAME, MISSING_REPORT_NAME, SKIPPED_REPORT_NAME]);
  });

  it('creates folders from entry names', async () => {
    const entries = [{ url: URL_A, name: 'A/x.jpg' }];
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A) });
    const { blob } = await buildZip(entries, { JSZip, fetch });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['A/', 'A/x.jpg']);
  });

  it('puts entries, reports, missing.txt and log.txt into the root folder', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: new Error('x') });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS, root: 'Owner_2026', delay: noDelay });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), [
      'Owner_2026/', 'Owner_2026/Owner_01_a.jpg', `Owner_2026/${ZIP_LOG_NAME}`,
      `Owner_2026/${MISSING_REPORT_NAME}`, `Owner_2026/${SKIPPED_REPORT_NAME}`,
    ]);
  });

  it('writes no reports when every fetch fails', async () => {
    const { fetch } = stubFetch({ [URL_A]: new Error('x'), [URL_B]: new Error('y') });
    const { blob, added } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS, delay: noDelay });
    assert.equal(blob, null);
    assert.equal(added, 0);
  });
});

describe('buildZip onProgress', () => {
  it('reports once per entry, done rising to total', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const progress = [];
    await buildZip(ENTRIES, { JSZip, fetch, onProgress: (done, total) => progress.push([done, total]) });
    assert.deepEqual(progress, [[1, 2], [2, 2]]);
  });

  it('counts missing photos too', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { fetch } = stubFetch({ [URL_A]: new Error('x'), [URL_B]: { ok: false, status: HTTP_NOT_FOUND } });
    const progress = [];
    await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay, onProgress: (done, total) => progress.push([done, total]) });
    assert.deepEqual(progress, [[1, 2], [2, 2]]);
  });

  it('reports a retried photo only after its last attempt', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { fetch, calls } = stubFetch({ [URL_A]: new Error('x') });
    const attemptsAtReport = [];
    await buildZip([ENTRIES[0]], { JSZip, fetch, delay: noDelay, onProgress: () => attemptsAtReport.push(calls.length) });
    assert.deepEqual(attemptsAtReport, [MAX_ATTEMPTS]);
  });
});

describe('isRetryable', () => {
  for (const status of [HTTP_TOO_MANY_REQUESTS, HTTP_SERVER_ERROR, HTTP_UNAVAILABLE]) {
    it(`retries HTTP ${status}`, () => assert.equal(isRetryable(status), true));
  }

  for (const status of [HTTP_FORBIDDEN, HTTP_NOT_FOUND]) {
    it(`does not retry HTTP ${status}`, () => assert.equal(isRetryable(status), false));
  }

  it('retries a network error', () => assert.equal(isRetryable(new TypeError('Failed to fetch')), true));

  it('retries a timeout', () => assert.equal(isRetryable(new DOMException('timed out', 'TimeoutError')), true));
});

describe('buildZip retries', () => {
  const entries = [{ url: URL_A, name: 'Owner_01_a.jpg' }];

  it('keeps a photo that fails once with 503', async () => {
    const { fetch, calls } = stubFetchSequence({ [URL_A]: [{ ok: false, status: HTTP_UNAVAILABLE }, okResponse(BYTES_A)] });
    const { blob, added, missing } = await buildZip(entries, { JSZip, fetch, delay: noDelay });
    assert.equal(calls.length, 2);
    assert.equal(added, 1);
    assert.deepEqual(missing, []);
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files), ['Owner_01_a.jpg']);
  });

  it('keeps a photo whose fetch throws twice', async () => {
    const { fetch, calls } = stubFetchSequence({ [URL_A]: [new Error('x'), new Error('y'), okResponse(BYTES_A)] });
    const { added, missing } = await buildZip(entries, { JSZip, fetch, delay: noDelay });
    assert.equal(calls.length, MAX_ATTEMPTS);
    assert.equal(added, 1);
    assert.deepEqual(missing, []);
  });

  it('fetches a 404 photo once and lists it as missing', async () => {
    const { fetch, calls } = stubFetchSequence({
      [URL_A]: [okResponse(BYTES_A)],
      [URL_B]: [{ ok: false, status: HTTP_NOT_FOUND }],
    });
    const { delay, waits } = recordDelay();
    const { blob, missing } = await buildZip(ENTRIES, { JSZip, fetch, delay });
    assert.deepEqual(calls.filter((url) => url === URL_B), [URL_B]);
    assert.deepEqual(waits, []);
    assert.deepEqual(missing, [URL_B]);
    const zip = await readZip(blob);
    assert.equal(await zip.file(MISSING_REPORT_NAME).async('string'), `${URL_B}\n`);
  });

  it('gives up after FETCH_RETRIES retries and lists the photo as missing', async () => {
    const { fetch, calls } = stubFetchSequence({
      [URL_A]: [okResponse(BYTES_A)],
      [URL_B]: [{ ok: false, status: HTTP_SERVER_ERROR }],
    });
    const { blob, missing } = await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay });
    assert.equal(calls.filter((url) => url === URL_B).length, MAX_ATTEMPTS);
    assert.deepEqual(missing, [URL_B]);
    const zip = await readZip(blob);
    assert.equal(await zip.file(MISSING_REPORT_NAME).async('string'), `${URL_B}\n`);
  });

  it('waits with exponential backoff between attempts', async () => {
    const { fetch } = stubFetchSequence({ [URL_A]: [{ ok: false, status: HTTP_SERVER_ERROR }] });
    const { delay, waits } = recordDelay();
    await buildZip(entries, { JSZip, fetch, delay });
    assert.deepEqual(waits, [1000, 2000]);
  });

  it('warns once per photo, only after the final attempt', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const { fetch } = stubFetchSequence({ [URL_A]: [{ ok: false, status: HTTP_SERVER_ERROR }] });
    await buildZip(entries, { JSZip, fetch, delay: noDelay });
    assert.equal(warn.mock.callCount(), 1);
    assert.deepEqual(warn.mock.calls[0].arguments, [`photo fetch failed: HTTP ${HTTP_SERVER_ERROR}`]);
  });

  it('waits on real timers when no delay is injected', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'warn', () => {});
    const flush = () => new Promise(setImmediate);
    const { fetch, calls } = stubFetchSequence({ [URL_A]: [{ ok: false, status: HTTP_SERVER_ERROR }] });
    const result = buildZip(entries, { JSZip, fetch });
    await flush();
    assert.equal(calls.length, 1);
    t.mock.timers.tick(RETRY_BASE_DELAY_MS);
    await flush();
    assert.equal(calls.length, 2);
    t.mock.timers.tick(2 * RETRY_BASE_DELAY_MS - 1);
    await flush();
    assert.equal(calls.length, 2);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(calls.length, MAX_ATTEMPTS);
    assert.deepEqual((await result).missing, [URL_A]);
  });
});

describe('buildZip log.txt', () => {
  const CLICK_LOG = { startedAt: Date.UTC(2026, 9, 9, 12), lines: [{ ms: 5, step: 'path: profile' }] };
  const URL_B_QUERY = `${URL_B}?token=secret`;

  it('logs the retries and the final status of a missing photo after the click log', async () => {
    const entries = [ENTRIES[0], { url: URL_B_QUERY, name: 'Owner_02_b.jpg' }];
    const failing = { ok: false, status: HTTP_UNAVAILABLE };
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B_QUERY]: failing });
    const { blob, logLines } = await buildZip(entries, { JSZip, fetch, delay: noDelay, log: CLICK_LOG, root: 'Owner' });
    const text = await (await readZip(blob)).file(`Owner/${ZIP_LOG_NAME}`).async('string');
    const lines = text.split('\n').filter((line) => line.startsWith('+'));
    assert.equal(lines[0], '+5 ms  path: profile');
    assert.deepEqual(lines.slice(1).map((line) => line.replace(/^\+\d+ ms {2}/, '')), [
      ...Array(FETCH_RETRIES).fill(`photo: retry  entry=Owner_02_b.jpg  status=${HTTP_UNAVAILABLE}  url=${URL_B}`),
      `photo: missing  entry=Owner_02_b.jpg  status=${HTTP_UNAVAILABLE}  url=${URL_B}`,
    ]);
    assert.doesNotMatch(text, /secret/);
    assert.equal(logLines.length, MAX_ATTEMPTS);
  });

  it('logs the error name of a photo whose fetch throws', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: new TypeError('Failed to fetch') });
    const { logLines } = await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay });
    assert.deepEqual({ ...logLines.at(-1), ms: 0 }, {
      ms: 0, step: 'photo: missing', entry: ENTRIES[1].name, status: undefined, reason: 'TypeError', url: URL_B });
  });

  it('writes log.txt for a warning without missing photos', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, log: CLICK_LOG, warning: true });
    const text = await (await readZip(blob)).file(ZIP_LOG_NAME).async('string');
    assert.match(text, /\+5 ms {2}path: profile\n/);
  });

  it('writes no log.txt for a clean build', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const { blob, logLines } = await buildZip(ENTRIES, { JSZip, fetch, log: CLICK_LOG });
    assert.equal((await readZip(blob)).file(ZIP_LOG_NAME), null);
    assert.deepEqual(logLines, []);
  });

  it('returns the fetch log lines without a blob when every photo fails', async () => {
    const { fetch } = stubFetch({ [URL_A]: { ok: false, status: HTTP_NOT_FOUND }, [URL_B]: { ok: false, status: HTTP_NOT_FOUND } });
    const { blob, logLines } = await buildZip(ENTRIES, { JSZip, fetch, delay: noDelay });
    assert.equal(blob, null);
    assert.deepEqual(logLines.map(({ step, status }) => `${step} ${status}`), [
      `photo: missing ${HTTP_NOT_FOUND}`, `photo: missing ${HTTP_NOT_FOUND}`,
    ]);
  });
});

describe('buildZip videos', () => {
  const MASTER_URL = masterUrlOf(VIDEO_ID_1);
  const HLS_DIR = MASTER_URL.slice(0, MASTER_URL.lastIndexOf('/') + 1);
  const BEST_VARIANT = `${HLS_DIR}${variantNameOf(VIDEO_ID_1, 854)}`;
  const SIGNING_URL = signingUrlOf(VIDEO_ID_1);
  const VIDEO_ENTRY = {
    url: MASTER_URL, name: `Videos/O_Videos_01_${VIDEO_ID_1}.mp4`, videoId: VIDEO_ID_1, hls: { query: SIGNED_QUERY, signing: SIGNING_URL },
  };
  const FRESH = { 'CloudFront-Policy': 'policy-2', 'CloudFront-Signature': 'signature-2', 'CloudFront-Key-Pair-Id': 'KEYPAIR1' };
  const FRESH_QUERY = 'Policy=policy-2&Signature=signature-2&Key-Pair-Id=KEYPAIR1';
  const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });
  const signed = (url) => `${url}?${SIGNED_QUERY}`;
  const textResponse = (text) => okResponse(new TextEncoder().encode(text));

  function videoResponses(media = MEDIA_PLAYLIST) {
    return {
      [signed(MASTER_URL)]: textResponse(masterPlaylist(VIDEO_ID_1)),
      [signed(BEST_VARIANT)]: textResponse(media),
      ...Object.fromEntries(SEGMENT_NAMES.map((name) => [signed(`${HLS_DIR}${name}`), okResponse(segmentBytes(name))])),
    };
  }

  it('fetches the best variant with the signed query, without cookies, and zips one mp4', async () => {
    const { fetch, calls } = stubFetch(videoResponses());

    const { blob, added, missing, unsupported } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.deepEqual(calls.map(({ url }) => url), [
      signed(MASTER_URL), signed(BEST_VARIANT), ...SEGMENT_NAMES.map((name) => signed(`${HLS_DIR}${name}`)),
    ]);
    assert.ok(calls.every(({ options }) => options.credentials === 'omit'));
    assert.deepEqual({ added, missing, unsupported }, { added: 1, missing: [], unsupported: [] });
    const mp4 = await (await readZip(blob)).file(VIDEO_ENTRY.name).async('uint8array');
    assert.equal(new TextDecoder().decode(mp4.subarray(4, 8)), 'ftyp');
  });

  it('photos keep their cookies beside a video', async () => {
    const { fetch, calls } = stubFetch({ ...videoResponses(), [URL_A]: okResponse(BYTES_A) });

    await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.equal(calls.find(({ url }) => url === URL_A).options.credentials, 'include');
  });

  it('a failing segment makes the video missing, logged without the signed query', async () => {
    const segment = signed(`${HLS_DIR}${SEGMENT_NAMES[1]}`);
    const { fetch } = stubFetch({ ...videoResponses(), [URL_A]: okResponse(BYTES_A), [segment]: { ok: false, status: HTTP_FORBIDDEN } });

    const { blob, missing, logLines } = await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch, delay: noDelay });

    assert.deepEqual(missing, [MASTER_URL]);
    assert.deepEqual({ ...logLines.at(-1), ms: 0 }, {
      ms: 0, step: 'video: missing', entry: VIDEO_ENTRY.name, status: HTTP_FORBIDDEN, reason: undefined, url: `${HLS_DIR}${SEGMENT_NAMES[1]}`,
    });
    const zip = await readZip(blob);
    assert.equal(zip.file(VIDEO_ENTRY.name), null);
    assert.equal(await zip.file(MISSING_REPORT_NAME).async('string'), `${MASTER_URL}\n`);
  });

  it('an encrypted stream is neither zipped nor missing, but listed in skipped.txt', async () => {
    const { fetch, calls } = stubFetch({ ...videoResponses(ENCRYPTED_MEDIA_PLAYLIST), [URL_A]: okResponse(BYTES_A) });

    const { blob, added, missing, unsupported, logLines } = await buildZip([ENTRIES[0], VIDEO_ENTRY], {
      JSZip, muxjs, fetch, reports: REPORTS,
    });

    assert.deepEqual({ added, missing, unsupported }, { added: 1, missing: [], unsupported: [MASTER_URL] });
    assert.equal(calls.some(({ url }) => url.includes('.ts')), false);
    assert.equal(logLines.at(-1).step, 'video: unsupported');
    const zip = await readZip(blob);
    assert.equal(zip.file(VIDEO_ENTRY.name), null);
    assert.equal(await zip.file(SKIPPED_REPORT_NAME).async('string'), `${SKIPPED_TEXT}Videos: 1 not supported (encrypted)\n`);
  });

  it('creates skipped.txt for an encrypted stream when there was none', async () => {
    const { fetch } = stubFetch({ ...videoResponses(ENCRYPTED_MEDIA_PLAYLIST), [URL_A]: okResponse(BYTES_A) });

    const { blob } = await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.equal(await (await readZip(blob)).file(SKIPPED_REPORT_NAME).async('string'), 'Videos: 1 not supported (encrypted)\n');
  });

  it('segments that do not remux make the video missing', async () => {
    const responses = videoResponses();
    for (const name of SEGMENT_NAMES) responses[signed(`${HLS_DIR}${name}`)] = okResponse([1, 2, 3]);
    const { fetch } = stubFetch({ ...responses, [URL_A]: okResponse(BYTES_A) });

    const { missing, logLines } = await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.deepEqual(missing, [MASTER_URL]);
    assert.equal(logLines.at(-1).reason, 'remux failed');
  });

  it('a media playlist without segments makes the video missing', async () => {
    const { fetch } = stubFetch({ ...videoResponses('#EXTM3U\n#EXT-X-ENDLIST\n'), [URL_A]: okResponse(BYTES_A) });

    const { missing, logLines } = await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.deepEqual(missing, [MASTER_URL]);
    assert.equal(logLines.at(-1).reason, 'no segments');
  });

  it('a mux.js exception makes only that video missing', async () => {
    const { fetch } = stubFetch({ ...videoResponses(), [URL_A]: okResponse(BYTES_A) });
    const throwingMuxjs = { mp4: { Transmuxer: class { on() {} push() { throw new Error('corrupt'); } } } };

    const { blob, missing, logLines } = await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs: throwingMuxjs, fetch });

    assert.ok(blob);
    assert.deepEqual(missing, [MASTER_URL]);
    assert.equal(logLines.at(-1).reason, 'remux failed');
  });

  it('fetches the videos before the photos and keeps the entry order in the ZIP', async () => {
    const { fetch, calls } = stubFetch({ ...videoResponses(), [URL_A]: okResponse(BYTES_A) });

    await buildZip([ENTRIES[0], VIDEO_ENTRY], { JSZip, muxjs, fetch, limit: 1 });

    assert.equal(calls[0].url, signed(MASTER_URL));
    assert.equal(calls.at(-1).url, URL_A);
  });

  it('expired parameters (403) are renewed once via the signing URL, and the rest of the video uses them', async () => {
    const fresh = (url) => `${url}?${FRESH_QUERY}`;
    const segmentUrls = SEGMENT_NAMES.map((name) => `${HLS_DIR}${name}`);
    const { fetch, calls } = stubFetch({
      [signed(MASTER_URL)]: textResponse(masterPlaylist(VIDEO_ID_1)),
      [signed(BEST_VARIANT)]: textResponse(MEDIA_PLAYLIST),
      [signed(segmentUrls[0])]: { ok: false, status: HTTP_FORBIDDEN },
      [SIGNING_URL]: jsonResponse(signedAnswer(FRESH)),
      ...Object.fromEntries(segmentUrls.map((url, index) => [fresh(url), okResponse(segmentBytes(SEGMENT_NAMES[index]))])),
    });

    const { added, logLines } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.equal(added, 1);
    assert.deepEqual(calls.slice(2).map(({ url }) => url), [signed(segmentUrls[0]), SIGNING_URL, fresh(segmentUrls[0]), fresh(segmentUrls[1])]);
    assert.equal(calls[3].options.credentials, 'include');
    assert.deepEqual(logLines.map(({ step }) => step), ['video: re-signed']);
  });

  it('a 403 that fresh parameters do not fix makes the video missing', async () => {
    const segment = signed(`${HLS_DIR}${SEGMENT_NAMES[0]}`);
    const { fetch } = stubFetch({
      ...videoResponses(), [segment]: { ok: false, status: HTTP_FORBIDDEN }, [SIGNING_URL]: { ok: false, status: HTTP_SERVER_ERROR },
    });

    const { missing, logLines } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs, fetch, delay: noDelay });

    assert.deepEqual(missing, [MASTER_URL]);
    assert.deepEqual(logLines.map(({ step, status }) => `${step} ${status}`), [`video: missing ${HTTP_FORBIDDEN}`]);
  });

  it('joins an fMP4 stream (EXT-X-MAP) without remuxing', async () => {
    const { fetch, calls } = stubFetch({
      [signed(MASTER_URL)]: textResponse(masterPlaylist(VIDEO_ID_1)),
      [signed(BEST_VARIANT)]: textResponse(FMP4_MEDIA_PLAYLIST),
      ...Object.fromEntries(FMP4_FILES.map((name) => [signed(`${HLS_DIR}${name}`), okResponse(fmp4Bytes(name))])),
    });

    const { blob, added } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs: null, fetch });

    assert.equal(added, 1);
    assert.deepEqual(calls.slice(2).map(({ url }) => url), FMP4_FILES.map((name) => signed(`${HLS_DIR}${name}`)));
    const mp4 = await (await readZip(blob)).file(VIDEO_ENTRY.name).async('uint8array');
    assert.equal(mp4.length, FMP4_FILES.reduce((length, name) => length + fmp4Bytes(name).length, 0));
  });

  for (const [label, answer] of [
    ['answers 206 with the range', (bytes, start, end) => ({ ok: true, status: 206, arrayBuffer: async () => bytes.slice(start, end + 1).buffer })],
    ['ignores the range and answers the whole file', (bytes) => ({ ok: true, status: 200, arrayBuffer: async () => bytes.slice().buffer })],
  ]) {
    it(`fetches EXT-X-BYTERANGE parts with a Range header when the server ${label}`, async () => {
      const file = new Uint8Array(byteRangeBytes());
      const ranges = [];
      const { fetch: base } = stubFetch({
        [signed(MASTER_URL)]: textResponse(masterPlaylist(VIDEO_ID_1)),
        [signed(BEST_VARIANT)]: textResponse(BYTERANGE_MEDIA_PLAYLIST),
      });
      const fetch = async (url, options) => {
        if (url !== signed(`${HLS_DIR}${BYTERANGE_FILE}`)) return base(url, options);
        const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range).map(Number);
        ranges.push([start, end]);
        return answer(file, start, end);
      };

      const { added } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs, fetch });

      assert.equal(added, 1);
      assert.deepEqual(ranges, [[0, 9023], [9024, 16919]]);
    });
  }

  it('a media playlist served as the source is used directly', async () => {
    const { fetch } = stubFetch({
      [signed(MASTER_URL)]: textResponse(MEDIA_PLAYLIST),
      ...Object.fromEntries(SEGMENT_NAMES.map((name) => [signed(`${HLS_DIR}${name}`), okResponse(segmentBytes(name))])),
    });

    const { added } = await buildZip([VIDEO_ENTRY], { JSZip, muxjs, fetch });

    assert.equal(added, 1);
  });
});
