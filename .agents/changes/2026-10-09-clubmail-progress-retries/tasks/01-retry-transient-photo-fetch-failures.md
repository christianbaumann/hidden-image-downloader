---
id: 01
dependencies: []
---

# Task 01: Retry transient photo fetch failures

Photos that fail with a transient error (network, timeout, 429, 5xx) are fetched again before they end up in `missing.txt`, so fewer profile ZIPs are incomplete.

## References

* `design.md#retries-in-fetchbytes`
* `design.md#interfaces`
* `lib/zip.js` (`fetchBytes`, `buildZip`, `FETCH_TIMEOUT_MS`)
* `tests/unit/zip.test.js` (`stubFetch`, `okResponse`)

## Work

* [ ] Add a retry loop to `fetchBytes` in `lib/zip.js`: up to `FETCH_RETRIES = 2` retries, exponential backoff from `RETRY_BASE_DELAY_MS = 1000` (1 s, 2 s)
* [ ] Add a pure `isRetryable` check: thrown errors (network, `AbortSignal.timeout`) and HTTP 429 / 5xx are retryable; other 4xx are not
* [ ] Let `buildZip` accept an injectable `delay` (default: real `setTimeout` promise) and pass it to `fetchBytes`, so tests run without real waits
* [ ] Keep the `console.warn` on final failure; no warning per intermediate attempt
* [ ] Unit tests in `tests/unit/zip.test.js` with a stubbed fetch that fails a given number of times

## Verification

* [ ] A photo that fails once with 503 and then succeeds is in the ZIP, and `missing.txt` is absent
* [ ] A photo that throws (network error) twice and then succeeds is in the ZIP
* [ ] A photo answering 404 is fetched exactly once and listed in `missing.txt`
* [ ] A photo failing with 500 on every attempt is fetched exactly 3 times and listed in `missing.txt`
* [ ] The waits between attempts are 1000 ms and 2000 ms (asserted via the injected `delay`)
* [ ] Existing `buildZip` behavior (order, reports, concurrency limit) is unchanged
* [ ] `npm test` and `npm run test:e2e` pass
