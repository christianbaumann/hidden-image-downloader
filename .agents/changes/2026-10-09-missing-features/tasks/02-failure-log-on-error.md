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

* [ ] Add a pure log module in `lib/` (create a log, add a line with step, status, reason, duration; render as text; strip the query string from URLs)
* [ ] Create one log per click in `handleActionClick`; log the dispatch path, each fetcher result (`failed`, `reason`), the probe and download outcome
* [ ] On a red badge or an unexpected exception, download the rendered log as `hidden-image-downloader-log.txt` (data URL; filename enforced through `pendingFilenames`/`onDeterminingFilename`; a failing log download must not hide the original error)
* [ ] Unit tests for the log module (rendering, query stripping, no token/message text in lines)
* [ ] Integration test in `tests/integration/background.test.js`: red badge → log download requested with that name; clean click → no log download
* [ ] README section "Errors" and `CLAUDE.md` describe the log

## Verification

* [ ] A click on a non-JoyClub page shows the red badge and requests `hidden-image-downloader-log.txt`, whose text names the reason
* [ ] A successful lightbox or profile click requests no log download
* [ ] The log never contains `access_token`, `Bearer`, cookie values, message content or URL query strings
* [ ] `npm test` and `npm run test:e2e` pass
