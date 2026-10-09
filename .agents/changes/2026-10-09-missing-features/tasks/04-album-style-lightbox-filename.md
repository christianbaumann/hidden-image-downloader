---
id: 04
dependencies: []
---

# Task 04: Album-style filename for the toolbar lightbox

**Status:** Done.

A lightbox image saved from the toolbar is named like its ZIP entry, `<Owner>_<Album>_<nn>_<photo-id>.jpg`, or `<Owner>_<photo-id>.jpg` when album or position is unknown. No timestamp.

## References

* `design.md#c-context-menu`
* `design.md#one-filename-scheme-for-single-images-and-zip-entries`
* `lib/lightbox.js` (`extractLightboxData`, `toDownloadCandidates`)
* `lib/filename.js` (`buildFilename`, `entryNumber`, `folderSegment`)
* `lib/profile.js` (`photoKey`, `albumEntries`: the ZIP entry naming)

## Work

* [x] Research with a live session which lightbox pages expose album title and position (profile album, `/profile/fotoalbum/…`, party albums, feed); write the findings to `../research-04-lightbox-context.md`
  * **Note:** Live session on 2026-10-09. No lightbox shows album title or counter; only the album page itself has them (`h2.profile-headline`, `a.album-link` order = API order). Feed and photo detail pages have no lightbox. Party albums not found in the session.
* [x] Extend `extractLightboxData` with album title, position and count, where the page has them
  * **Note (deviation):** Not extended. The only page with album context is `/profile/fotoalbum/…`, where the toolbar takes the ZIP path, so the toolbar lightbox never has album context. `toDownloadCandidates` and `buildFilename` take `album`, `position`, `count`; task 05 (context menu) fills them on the album page. `extractLightboxData` no longer reads the title.
* [x] Replace the single-image name in `buildFilename` with the new scheme, sharing the ZIP entry's stem logic (`photoKey`, `folderSegment`, `entryNumber`) instead of duplicating it
* [x] Remove helpers left unused (e.g. `formatTimestamp`, `pickTitle`) if nothing else uses them
* [x] Update unit tests in `tests/unit/filename.test.js` and `tests/unit/lightbox.test.js`; update the E2E filename assertion
* [x] README "Usage" and `CLAUDE.md` describe the new name

## Verification

* [x] Lightbox on an album page with known position → `<Owner>_<Album>_<nn>_<photo-id>.jpg`, matching the name of the same photo in the profile ZIP
  * **Note:** Naming verified via `tests/unit/lightbox.test.js` › "names an album photo like its entry in the profile ZIP" and `tests/unit/filename.test.js` › "buildFilename: album photo …". Live: the lightbox image URL carries the photo UUID (`photoKey` matches the ZIP) and the album page order matches the API order. Reading album and position on the album page moves to task 05 (see research).
* [x] Lightbox without album context → `<Owner>_<photo-id>.jpg`
  * **Note:** Verified via `tests/e2e/download.spec.js` › "downloads the lightbox image as <Owner>_<photo-id>.jpg" and `tests/unit/lightbox.test.js` › "takes the photo key from a UUID image url over data-photo"
* [x] `.webp` fallback keeps the same stem with `.webp`
  * **Note:** Verified via `tests/e2e/download.spec.js` › "falls back to the webp when the server has no jpg" and `tests/unit/lightbox.test.js` › "offers the jpg first, then the original webp, with one stem"
* [x] `npm test` and `npm run test:e2e` pass
  * **Note:** Verified via `npm test` (451 pass) and `npm run test:e2e` (14 pass) after merging with task 02
