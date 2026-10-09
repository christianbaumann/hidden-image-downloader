---
id: 02
dependencies: []
---

# Task 02: Show ZIP progress on the badge

While a profile ZIP is being built, the toolbar badge shows how far it is, as a count while it fits in 4 characters (`9/80`) and as a percentage otherwise (`37%`), with the tooltip `n of m photos`.

## References

* `design.md#progress-on-the-badge`
* `design.md#combined-percentage-across-api-and-photo-phase`
* `design.md#progress-messages-from-the-offscreen-document`
* `design.md#interfaces`
* `background.js` (`showBadge`, `clearBadge`, `downloadZip`, `buildZipOffscreen`, `handleActionClick`)
* `offscreen.js` (`build-zip` message)
* `lib/zip.js` (`buildZip`)
* `tests/integration/background.test.js`, `tests/e2e/download.spec.js`

## Work

* [x] New pure module `lib/progress.js`: `progressBadgeText(done, total)`, `overallPercent(phase, done, total)` (API phase 0–10 %, photo phase 10–100 %), `shouldReport(prevPercent, nextPercent)` (whole-percent throttle); named constants for the 10 % share and the 4-character badge limit
* [x] `buildZip` in `lib/zip.js` accepts `onProgress(done, total)` and calls it after each photo fetch (success or final failure)
* [x] `offscreen.js` passes `onProgress` and sends `{ target: 'background', action: 'zip-progress', jobId, done, total }`, throttled with `shouldReport`
* [x] `background.js`: assign a `jobId` per ZIP job and send it with `build-zip`; map `jobId` → `tabId`; listen for `zip-progress` and update badge text, `BADGE_PROGRESS_COLOR` (blue) and tooltip
* [x] `background.js`: set the API-phase progress itself as resolved fetchers / fetcher count (one fetcher today, so 0 → 10 %)
* [x] At the end, clear the progress badge or replace it with the existing warning/error badge; drop the `jobId` mapping
* [x] Unit tests for `lib/progress.js` and `onProgress` in `buildZip`; integration test for the `zip-progress` → badge mapping with stubbed `chrome`
* [x] Update README (badge progress) and CLAUDE.md (`zip-progress` message, `jobId`)

## Verification

* [x] `progressBadgeText(9, 80)` is `9/80`; `progressBadgeText(10, 80)` is a percentage within the photo phase; the text never exceeds 4 characters
  **Note:** Verified via `tests/unit/progress.test.js` (`progressBadgeText`; `10/80` → `21%`, limit checked for totals up to 12345)
* [x] `onProgress` is called once per entry, with `done` rising to `total`, also when photos are missing
  **Note:** Verified via `tests/unit/zip.test.js` (`buildZip onProgress`)
* [x] Progress messages are sent at most once per whole percent
  **Note:** Verified via `tests/unit/progress.test.js` (`shouldReport`, `throttleProgress` over 1000 entries); `offscreen.js` sends only through `throttleProgress`
* [x] Two ZIP jobs running at the same time update the badges of their own tabs only
  **Note:** Verified via `tests/integration/background.test.js` (`two ZIP jobs at once …`); mutation check: mapping progress to the last job's tab makes it fail
* [x] After a complete ZIP the badge is empty and the tooltip is the default title; after missing photos it shows the amber warning
  **Note:** Verified via `tests/integration/background.test.js` (`ZIP progress badge` suite) and E2E
* [x] E2E: during an album ZIP the badge shows progress text before it ends cleared
  **Note:** Verified via `tests/e2e/download.spec.js` (`shows the ZIP progress on the badge before clearing it`), stable over 5 repeats
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 253 unit/integration tests, 8 E2E tests pass

## Deviations from the design

* Tooltip during the API phase is "loading album list": the photo total ("n of m photos") is unknown until the fetchers return.
* `lib/progress.js` also exports `PHASES` and `throttleProgress(report)`, so the per-percent throttle that `offscreen.js` uses is unit-testable (`offscreen.js` registers a listener at load and can't be imported in Node).
* `background.js` runs fetchers through `extractAllWithProgress(tabId, [[func, args], …])`, which counts resolved fetchers for the API phase. Task 03 adds the ClubMail fetcher to that list.

## Review

* Approved after a subagent review. Fixed: an unexpected (rethrown) error now clears the progress badge instead of leaving a stale blue `10%`. Tightened the `onProgress` retry test.
* Latent: with two fetchers, a late fetcher could paint progress over the error badge. Carried over as a work item to Task 03, which adds the second fetcher.
* `chrome.runtime.sendMessage` from an extension page resolves with `undefined` when the service worker listener does not answer (checked in Chrome via Playwright), so `zip-progress` logs no warnings.
