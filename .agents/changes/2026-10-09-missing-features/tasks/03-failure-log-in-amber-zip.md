---
id: 03
dependencies:
- 02
---

# Task 03: log.txt inside amber ZIPs

A ZIP saved with an amber badge (missing photos or ClubMail unavailable) holds `<top folder>/log.txt` next to `missing.txt` and `skipped.txt`, including the offscreen document's fetch failures and retries.

## References

* `design.md#m-failure-log`
* `background.js` (`downloadZip`, `buildZipOffscreen`, warnings)
* `offscreen.js` (`build-zip` message)
* `lib/zip.js` (`buildZip`, `fetchBytes`)

## Work

* [ ] `buildZip` collects its own log lines (fetch failure status per entry, retries) with query-free URLs and returns them
* [ ] The service worker passes its log lines and the ClubMail warning flag with `build-zip`; `buildZip` writes `log.txt` when photos are missing or the flag is set
* [ ] Unit tests in `tests/unit/zip.test.js`: missing photo → `log.txt` with retry lines; ClubMail flag → `log.txt`; clean build → no `log.txt`
* [ ] E2E: a profile with one failing photo gives a ZIP with `log.txt` (`zipEntries` in `tests/e2e/download.spec.js`)
* [ ] README and `CLAUDE.md` describe `log.txt`

## Verification

* [ ] An amber ZIP contains `<Owner>/log.txt` with the failed photo URL (no query) and its HTTP status or error
* [ ] A clean ZIP contains no `log.txt`
* [ ] A red error still gives the separate log file from task 02
* [ ] `npm test` and `npm run test:e2e` pass
