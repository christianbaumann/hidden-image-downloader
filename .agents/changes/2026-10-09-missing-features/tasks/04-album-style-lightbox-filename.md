---
id: 04
dependencies: []
---

# Task 04: Album-style filename for the toolbar lightbox

A lightbox image saved from the toolbar is named like its ZIP entry, `<Owner>_<Album>_<nn>_<photo-id>.jpg`, or `<Owner>_<photo-id>.jpg` when album or position is unknown. No timestamp.

## References

* `design.md#c-context-menu`
* `design.md#one-filename-scheme-for-single-images-and-zip-entries`
* `lib/lightbox.js` (`extractLightboxData`, `toDownloadCandidates`)
* `lib/filename.js` (`buildFilename`, `entryNumber`, `folderSegment`)
* `lib/profile.js` (`photoKey`, `albumEntries`: the ZIP entry naming)

## Work

* [ ] Research with a live session which lightbox pages expose album title and position (profile album, `/profile/fotoalbum/…`, party albums, feed); write the findings to `../research-04-lightbox-context.md`
* [ ] Extend `extractLightboxData` with album title, position and count, where the page has them
* [ ] Replace the single-image name in `buildFilename` with the new scheme, sharing the ZIP entry's stem logic (`photoKey`, `folderSegment`, `entryNumber`) instead of duplicating it
* [ ] Remove helpers left unused (e.g. `formatTimestamp`, `pickTitle`) if nothing else uses them
* [ ] Update unit tests in `tests/unit/filename.test.js` and `tests/unit/lightbox.test.js`; update the E2E filename assertion
* [ ] README "Usage" and `CLAUDE.md` describe the new name

## Verification

* [ ] Lightbox on an album page with known position → `<Owner>_<Album>_<nn>_<photo-id>.jpg`, matching the name of the same photo in the profile ZIP
* [ ] Lightbox without album context → `<Owner>_<photo-id>.jpg`
* [ ] `.webp` fallback keeps the same stem with `.webp`
* [ ] `npm test` and `npm run test:e2e` pass
