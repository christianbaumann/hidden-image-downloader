---
id: 04
dependencies:
- 02
---

# Task 04: Single-image title from the lightbox DOM

Toolbar lightbox downloads and "Save hidden image" outside profile and album pages put the lightbox photo title (`.lb_img_title`) into the single-image name: `<Owner>_<Title>_<id>.<ext>` (or with album context `<Owner>_<Album>_<nn>_<Title>_<id>.<ext>`).

## References

* `design.md#item-3-titles-in-filenames` (data flow 3c, other pages)
* `design.md#single-image-title-from-the-captions-api` (DOM part)
* `lib/lightbox.js` (`extractLightboxData`, `imageCandidates`), `lib/filename.js` (`buildFilename`, `photoStem`, `PLACEHOLDER_TITLES`)
* `content.js` (layer description), `lib/hidden-image.js` (`toHiddenImageCandidates`), `background.js` (`handleActionClick` lightbox path, `handleMenuClick`)
* `tests/e2e/fixtures/lightbox.html:20` ("Rück Ansicht"), `:26` (`...`)

## Work

* [ ] `extractLightboxData` reads `.lb_img_title` of the shown photo
* [ ] `content.js` reports the lightbox title per layer; `toHiddenImageCandidates` passes it on
* [ ] `imageCandidates` → `buildFilename` take `title` (placeholders dropped, `titleSegment`, byte cap)
* [ ] Unit, integration and E2E assertions for both paths (title, placeholder `...`, none)
* [ ] Update `README.md` and `CLAUDE.md` (single-image filename, context menu notes)

## Verification

* [ ] The lightbox photo "Rück Ansicht" is saved as `<Owner>_Rück-Ansicht_<id>.jpg` via toolbar and via the context menu
* [ ] A lightbox photo titled `...` keeps `<Owner>_<id>.jpg`
* [ ] Names of the same photo in the ZIP and as single image match where album context is known
* [ ] `npm test` and `npm run test:e2e` pass
