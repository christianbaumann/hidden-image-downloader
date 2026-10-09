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

* [ ] New pure module `lib/progress.js`: `progressBadgeText(done, total)`, `overallPercent(phase, done, total)` (API phase 0–10 %, photo phase 10–100 %), `shouldReport(prevPercent, nextPercent)` (whole-percent throttle); named constants for the 10 % share and the 4-character badge limit
* [ ] `buildZip` in `lib/zip.js` accepts `onProgress(done, total)` and calls it after each photo fetch (success or final failure)
* [ ] `offscreen.js` passes `onProgress` and sends `{ target: 'background', action: 'zip-progress', jobId, done, total }`, throttled with `shouldReport`
* [ ] `background.js`: assign a `jobId` per ZIP job and send it with `build-zip`; map `jobId` → `tabId`; listen for `zip-progress` and update badge text, `BADGE_PROGRESS_COLOR` (blue) and tooltip
* [ ] `background.js`: set the API-phase progress itself as resolved fetchers / fetcher count (one fetcher today, so 0 → 10 %)
* [ ] At the end, clear the progress badge or replace it with the existing warning/error badge; drop the `jobId` mapping
* [ ] Unit tests for `lib/progress.js` and `onProgress` in `buildZip`; integration test for the `zip-progress` → badge mapping with stubbed `chrome`
* [ ] Update README (badge progress) and CLAUDE.md (`zip-progress` message, `jobId`)

## Verification

* [ ] `progressBadgeText(9, 80)` is `9/80`; `progressBadgeText(10, 80)` is a percentage within the photo phase; the text never exceeds 4 characters
* [ ] `onProgress` is called once per entry, with `done` rising to `total`, also when photos are missing
* [ ] Progress messages are sent at most once per whole percent
* [ ] Two ZIP jobs running at the same time update the badges of their own tabs only
* [ ] After a complete ZIP the badge is empty and the tooltip is the default title; after missing photos it shows the amber warning
* [ ] E2E: during an album ZIP the badge shows progress text before it ends cleared
* [ ] `npm test` and `npm run test:e2e` pass
