import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { FETCH_CONCURRENCY, FETCH_RETRIES, RETRY_BASE_DELAY_MS, buildZip, isRetryable, mapWithLimit } from '../../lib/zip.js';
import { MISSING_REPORT_NAME, SKIPPED_REPORT_NAME } from '../../lib/profile.js';

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
      assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', MISSING_REPORT_NAME]);
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

  it('writes a report next to the photos', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: okResponse(BYTES_B) });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', 'Owner_02_b.jpg', SKIPPED_REPORT_NAME]);
    assert.equal(await zip.file(SKIPPED_REPORT_NAME).async('string'), SKIPPED_TEXT);
  });

  it('writes reports and missing.txt together', async () => {
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A), [URL_B]: new Error('x') });
    const { blob } = await buildZip(ENTRIES, { JSZip, fetch, reports: REPORTS, delay: noDelay });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', MISSING_REPORT_NAME, SKIPPED_REPORT_NAME]);
  });

  it('creates folders from entry names', async () => {
    const entries = [{ url: URL_A, name: 'A/x.jpg' }];
    const { fetch } = stubFetch({ [URL_A]: okResponse(BYTES_A) });
    const { blob } = await buildZip(entries, { JSZip, fetch });
    const zip = await readZip(blob);
    assert.deepEqual(Object.keys(zip.files).sort(), ['A/', 'A/x.jpg']);
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
