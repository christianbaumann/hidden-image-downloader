---
id: 03
dependencies:
- 02
---

# Task 03: log.txt inside amber ZIPs

**Status:** Done.

A ZIP saved with an amber badge (missing photos or ClubMail unavailable) holds `<top folder>/log.txt` next to `missing.txt` and `skipped.txt`, including the offscreen document's fetch failures and retries.

## References

* `design.md#m-failure-log`
* `background.js` (`downloadZip`, `buildZipOffscreen`, warnings)
* `offscreen.js` (`build-zip` message)
* `lib/zip.js` (`buildZip`, `fetchBytes`)

## Work

* [x] `buildZip` collects its own log lines (fetch failure status per entry, retries) with query-free URLs and returns them
* [x] The service worker passes its log lines and the ClubMail warning flag with `build-zip`; `buildZip` writes `log.txt` when photos are missing or the flag is set
* [x] Unit tests in `tests/unit/zip.test.js`: missing photo → `log.txt` with retry lines; ClubMail flag → `log.txt`; clean build → no `log.txt`
* [x] E2E: a profile with one failing photo gives a ZIP with `log.txt` (`zipEntries` in `tests/e2e/download.spec.js`)
* [x] README and `CLAUDE.md` describe `log.txt`

## Verification

* [x] An amber ZIP contains `<Owner>/log.txt` with the failed photo URL (no query) and its HTTP status or error
  **Note:** Verified via E2E `lists a missing album photo in missing.txt and log.txt and warns` and `a failing ClubMail API still saves the album ZIP and warns` (`tests/e2e/download.spec.js`); unit `buildZip log.txt` (`tests/unit/zip.test.js`) checks retry lines, error names and the stripped query
* [x] A clean ZIP contains no `log.txt`
  **Note:** Verified via unit `writes no log.txt for a clean build` and E2E `downloads every accessible album into its own folder` (exact entry list)
* [x] A red error still gives the separate log file from task 02
  **Note:** Verified via integration `failure log` suite (incl. new `the offscreen fetch failures land in the log of a failed build`) and E2E `saves a failure log that names the reason on non-JoyClub pages`
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 461 unit/integration tests, 14 E2E tests pass
