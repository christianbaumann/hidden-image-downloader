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

* [x] `extractLightboxData` reads `.lb_img_title` of the shown photo
* [x] `content.js` reports the lightbox title per layer; `toHiddenImageCandidates` passes it on
* [x] `imageCandidates` → `buildFilename` take `title` (placeholders dropped, `titleSegment`, byte cap)
* [x] Unit, integration and E2E assertions for both paths (title, placeholder `...`, none)
* [x] Update `README.md` and `CLAUDE.md` (single-image filename, context menu notes)

## Verification

* [x] The lightbox photo "Rück Ansicht" is saved as `<Owner>_Rück-Ansicht_<id>.jpg` via toolbar and via the context menu
  **Note:** Verified via E2E `downloads the lightbox image as <Owner>_<Title>_<photo-id>.jpg` and `the context menu on a lightbox saves the same file as the toolbar click` (`TestOwner_Rück-Ansicht_1001.jpg`); unit `puts the lightbox title before the id`, `puts the lightbox title of the image layer into the name`; integration `puts the lightbox title into the filename` / `puts the lightbox title of the image layer into the filename`. Live 2026-10-10: menu on an album page lightbox ("Piercings") → `<Owner>_Die-Lady_02_Piercings_<id>.jpg`.
* [x] A lightbox photo titled `...` keeps `<Owner>_<id>.jpg`
  **Note:** Verified via E2E `a lightbox photo with the placeholder title "..." keeps <Owner>_<photo-id>.jpg via menu and toolbar` and unit `keeps the name without title for the placeholder "..." or an empty title`, `buildFilename leaves out a placeholder, empty or missing title`. Live: a `...` photo on the main album page → `<Owner>_Fotos-von-uns_02_<id>.jpg`.
* [x] Names of the same photo in the ZIP and as single image match where album context is known
  **Note:** Verified via unit `names a titled album photo like its entry in the profile ZIP` and `a titled album card is named like its titled ZIP entry`. Live 2026-10-10: the menu name `<Owner>_Die-Lady_02_Piercings_<id>.jpg` equals the entry in the profile ZIP from the same album page.
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 715 unit/integration tests, 31 E2E tests.

## Notes

* Live (2026-10-10): `.lb_img_title` exists in the lightbox slides of album pages and holds the raw title, placeholders `...` and `Profilbild` included. The lightbox only opens on profile and album pages (research-04), which take the ZIP path on a toolbar click, so the toolbar lightbox path never meets a live lightbox; it is covered by the fixture only.
* The DOM title is passed wherever the layer sits in a lightbox slide, also on album pages. Album grid cards have no title in the DOM; task 05 adds it from the captions API.
