---
id: 05
dependencies:
- 03
---

# Task 05: One top folder in every ZIP

Follow-up from use (2026-10-09): the ClubMail-only ZIP extracted to a bare `ClubMail/` folder, the profile ZIP to `<Owner>_<timestamp>/ClubMail/`. macOS Archive Utility wraps a ZIP with several top-level items in a folder named after the ZIP, but extracts a ZIP with a single top folder as is. Both ZIPs now hold one top folder named like the ZIP.

## References

* `lib/zip.js` (`buildZip`), `offscreen.js`, `background.js` (`downloadZip`)

## Work

* [x] `buildZip` takes `root` and writes entries, reports and `missing.txt` below it
* [x] `downloadZip` sends the ZIP name without `.zip` as `root` with `build-zip`; `offscreen.js` passes it on
* [x] Tests (unit, integration, E2E); README, CLAUDE.md

## Verification

* [x] Profile ZIP: `<Owner>_<timestamp>/<Album>/…`, `<Owner>_<timestamp>/ClubMail/…`, reports in `<Owner>_<timestamp>/`
  **Note:** Unit test `puts entries, reports and missing.txt into the root folder`; integration test checks `root` + `.zip` equals the filename; every E2E ZIP test asserts all entries lie below `<zip name>/`.
* [x] ClubMail-only ZIP: `<Partner>_ClubMail_<timestamp>/ClubMail/…`
  **Note:** Integration test `builds a ClubMail-only ZIP named after the partner`; E2E conversation test.
* [x] Extracting both ZIPs in Finder gives `<zip name>/ClubMail/…`
  **Note:** Checked manually by the user in Finder (2026-10-09).
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 377 unit/integration tests and 13 E2E tests pass.

## Notes

* The top folder of the ClubMail-only ZIP is its full stem, `<Partner>_ClubMail_<timestamp>`, so the folder always matches the ZIP name.
