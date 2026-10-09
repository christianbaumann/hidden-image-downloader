---
id: 02
dependencies: []
---

# Task 02: Failure log file on red badge or exception

A click that ends with a red badge or an unexpected exception also downloads `hidden-image-downloader-log.txt`, which shows the steps of the click and why it failed. Clean clicks write nothing.

## References

* `design.md#m-failure-log`
* `design.md#failure-log-only-on-warnings-and-errors`
* `design.md#log-without-secrets-or-content`
* `/Users/christian.baumann/git_repos/_own/jira-ticket-exporter` (README "Diagnostics", in-memory run log)
* `background.js` (`handleActionClick`, `ERROR_REASONS`, `showError`, `startDownload`, `suggestOwnFilename`)

## Work

* [x] Add a pure log module in `lib/` (create a log, add a line with step, status, reason, duration; render as text; strip the query string from URLs)
* [x] Create one log per click in `handleActionClick`; log the dispatch path, each fetcher result (`failed`, `reason`), the probe and download outcome
* [x] On a red badge or an unexpected exception, download the rendered log as `hidden-image-downloader-log.txt` (data URL; filename enforced through `pendingFilenames`/`onDeterminingFilename`; a failing log download must not hide the original error)
* [x] Unit tests for the log module (rendering, query stripping, no token/message text in lines)
* [x] Integration test in `tests/integration/background.test.js`: red badge → log download requested with that name; clean click → no log download
* [x] README section "Errors" and `CLAUDE.md` describe the log

## Verification

* [x] A click on a non-JoyClub page shows the red badge and requests `hidden-image-downloader-log.txt`, whose text names the reason **Note:** Verified via `tests/integration/background.test.js` ("failure log": filename, data URL, reason) and E2E `saves a failure log that names the reason on non-JoyClub pages` (reads the file from disk). Real Chrome hides `tab.url` on non-permitted hosts, so that log has no URL line.
* [x] A successful lightbox or profile click requests no log download **Note:** Verified via integration tests `a clean lightbox/profile click downloads no log` and E2E lightbox + profile ZIP tests (`logDownloadIds` empty).
* [x] The log never contains `access_token`, `Bearer`, cookie values, message content or URL query strings **Note:** Verified via unit tests (`stripQuery`, `renderLog` writes only given fields) and integration tests (tab URL query, probe URL query, ClubMail message text absent). Fetchers never return tokens; log lines are built only from step names, status, fixed reasons and stripped URLs.
* [x] `npm test` and `npm run test:e2e` pass **Note:** `npm test` 451 pass; `npm run test:e2e` 14 pass.
* [ ] (manual testing required) The log file on disk is named `hidden-image-downloader-log.txt`: Playwright saves downloads under GUID names, so E2E sees only the requested name. Integration test `the log download gets its name through onDeterminingFilename` covers the request.

## Notes

* `fetchProfileAlbums` returns `{ failed: true }` without a reason, so the log says only `albums: failed`. Adding reasons there is outside this task.
* Unexpected exceptions log only `error.name`; their message may hold page data.
* ZIP failures log the failing step: `zip: build failed  reason=…` before the build answers, or `zip: <n> added, <m> missing` followed by the error when the download fails.
* Two failing clicks with identical log text in the same millisecond share one data URL, so the second may get Chrome's default name. Not handled: practically unreachable.
