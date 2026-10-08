import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { FETCH_CONCURRENCY, buildZip, mapWithLimit } from '../../lib/zip.js';
import { MISSING_REPORT_NAME } from '../../lib/profile.js';

const URL_A = 'https://img.example/a.jpg';
const URL_B = 'https://img.example/b.jpg';
const BYTES_A = [1, 2, 3];
const BYTES_B = [4, 5];
const HTTP_NOT_FOUND = 404;

const ENTRIES = [
  { url: URL_A, name: 'Owner_01_a.jpg' },
  { url: URL_B, name: 'Owner_02_b.jpg' },
];

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
      const { blob, added, missing } = await buildZip(ENTRIES, { JSZip, fetch });
      assert.equal(added, 1);
      assert.deepEqual(missing, [URL_B]);
      const zip = await readZip(blob);
      assert.deepEqual(Object.keys(zip.files).sort(), ['Owner_01_a.jpg', MISSING_REPORT_NAME]);
      assert.equal(await zip.file(MISSING_REPORT_NAME).async('string'), `${URL_B}\n`);
    });
  }

  it('returns no blob when every fetch fails', async () => {
    const { fetch } = stubFetch({ [URL_A]: new Error('x'), [URL_B]: { ok: false, status: HTTP_NOT_FOUND } });
    const { blob, added, missing } = await buildZip(ENTRIES, { JSZip, fetch });
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
});
