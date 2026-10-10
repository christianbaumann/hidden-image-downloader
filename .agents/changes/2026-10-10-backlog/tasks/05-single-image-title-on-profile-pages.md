---
id: 05
dependencies:
- 04
---

# Task 05: Single-image title on profile and album pages

"Save hidden image" on profile and album pages looks the photo title up via the captions API (injected in the tab with the session token), so the single image gets the same name as its ZIP entry.

## References

* `design.md#item-3-titles-in-filenames` (data flow 3c, open check for 3c)
* `design.md#single-image-title-from-the-captions-api`
* `lib/profile.js` (`getProfileAlbumImageCaptions`, `captionsById`, token handling in `fetchProfileAlbums`)
* `background.js` (`handleMenuClick`), `lib/hidden-image.js` (`toHiddenImageCandidates`), `content.js` (`data-photo`, `#media_id_0_<id>_`)
* `tests/e2e/fixtures.js` (`routeJoyclubApi`, `captions`)

## Work

* [x] Live check: `data-photo` and the `#media_id_0_<id>_` id are the id `profileAlbum.image.byIdList` takes; record the result in this task. If not, stop and update the design
  **Note:** Verified live 2026-10-10 (playwright-cli, user's cookies, one profile's main album page, 4 photos): album grid cards have **no** `data-photo` (0 elements inside `a.album-link`); the `#media_id_0_<id>_` ids equal `mainAlbum.userImageIdList` in the same order (string ids); `byIdList` with such an id answers `ProfileAlbumImageItemResultSuccess` for that id. In the lightbox opened from the grid, `img.secure_image[data-photo]` holds the same ids. So both ids work; the grid card needs the link id.
* [x] Self-contained injected function: token → `getProfileAlbumImageCaptions` for one id → raw title, `null` on any failure
  **Note:** `fetchPhotoTitle(photoId)` in `lib/profile.js`; answers `''` for a success without title, `null` for a failed request, a GraphQL error, a not-found result or an answer without that id.
* [x] `handleMenuClick` calls it on profile and album pages and passes the title to `buildFilename`; a failure saves without title and adds a log line
  **Note:** `captionTitle` in `background.js`; log lines `title: from captions` / `title: unavailable`.
* [x] Unit, integration and E2E coverage (title found, placeholder, API failure)
* [x] Update `README.md` and `CLAUDE.md`

## Verification

* [x] On an album page, "Save hidden image" saves the same name as the photo's ZIP entry, title included
  **Note:** Verified via E2E `the context menu saves the album card below the overlay under its ZIP name, caption title included` (menu name is an entry of the ZIP from the same page) and unit `an album card takes the caption title like its ZIP entry`. Live 2026-10-10: menu on the second grid card of a regular album page → `<Owner>_Die-Lady_02_Piercings_<id>.jpg`, the same as the entry `Die-Lady/<Owner>_Die-Lady_02_Piercings_<id>.jpg` in the ZIP from that page (the grid shows no title, so it came from the API).
* [x] A failing captions call still saves the image, without title
  **Note:** Verified via E2E `a failing captions API still saves the album card, without title`, integration `a failed captions call saves without title and logs it` / `a failed injection saves without title and logs it`, unit `fetchPhotoTitle` failure cases (`… → null`).
* [x] The menu click on non-profile pages makes no captions call
  **Note:** Verified via integration `asks the clicked frame for the image and downloads its jpg` (feed URL, no `executeScript`) and `a lightbox title on the page needs no captions call`.
* [x] `npm test` and `npm run test:e2e` pass

## Decisions and deviations

* DOM title vs API title: the layer's lightbox title (`.lb_img_title`, task 04) wins; the captions API is asked only on profile URLs when the layer has no title (album grid cards). Both carry the same raw title, so the lightbox costs no extra call. A placeholder lightbox title (`...`) also skips the call; the API would answer the same placeholder.
* API id: the layer's `data-photo`, else the id in its album link (`findHiddenImage` → `apiPhotoId`), since live grid cards have no `data-photo`. The E2E fixtures `album.html` and `album-regular.html` lost their grid `data-photo` to match the live DOM.
* The query reuses the operation name `getProfileAlbumImageCaptions` but asks only `byIdList { title }` (no description, no hashtags), so the E2E route and test stubs answer it unchanged.
* Design 3c also names "the lightbox path": the toolbar lightbox path makes no captions call, since a profile URL always takes the ZIP path and the lightbox exists only on profile and album pages (task 04).
