---
id: 06
dependencies:
- 05
---

# Task 06: ZIP names without timestamp

Follow-up (2026-10-09): ZIP names and their top folders drop the timestamp: `<Owner>.zip` → `<Owner>/…`, `<Partner>_ClubMail.zip` → `<Partner>_ClubMail/…`. Single-image downloads keep theirs.

## References

* `lib/profile.js` (`toAlbumZipRequest`, `toClubMailZipRequest`)

## Work

* [x] Both request builders name the ZIP without `formatTimestamp`; the top folder follows from the ZIP name (task 05)
* [x] Tests (unit, integration, E2E); README, CLAUDE.md, design

## Verification

* [x] Profile ZIP is `<Owner>.zip`, ClubMail-only ZIP `<Partner>_ClubMail.zip`, each with the matching top folder
  **Note:** Unit tests in `profile.test.js`; integration tests check the filename and `root`; E2E asserts the exact filenames and that every entry lies below `<zip name>/`.
* [x] A second export of the same profile is saved as `<Owner> (1).zip`
  **Note:** Checked manually by the user (2026-10-09); not automatable, Playwright saves downloads under GUID names.
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 377 unit/integration tests and 13 E2E tests pass.

## Notes

* Repeated exports extract into the same `<Owner>/` folder name; Finder then creates `<Owner> 2/`.
