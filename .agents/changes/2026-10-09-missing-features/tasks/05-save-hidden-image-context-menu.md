---
id: 05
dependencies:
- 04
---

# Task 05: "Save hidden image" context menu

Right-clicking any image on a JoyClub page (profile cards, album grids, lightbox, feed) offers "Save hidden image", which saves the real image below the overlay under the task 04 name.

## References

* `design.md#c-context-menu`
* `design.md#content-script-finds-the-right-clicked-image`
* `lib/lightbox.js` (`parseBackgroundImageUrl`), `lib/image-url.js` (`largestJpegUrl`, `toJpgUrl`)
* `background.js` (`firstAvailable`, `startDownload`)
* `../research-04-lightbox-context.md` (album context only on `/profile/fotoalbum/…`: `h2.profile-headline`, `a.album-link` order; photo detail pages use `.image-ui` with `srcset`)
* `manifest.json`, `tests/unit/manifest.test.js`

## Work

* [x] `manifest.json`: `contextMenus` permission; `content_scripts` for `https://www.joyclub.de/*` and `https://www.joyclub.com/*`
* [x] Content script: store the last `contextmenu` position; on request, use `elementsFromPoint` to find the first `img.secure_image`, `background-image` or `srcset` below the overlay and return `{ url or srcset, owner, album, position, count, photoId, pageUrl }`
  * **Note (deviation):** `content.js` returns the raw `elementsFromPoint` layers (computed `backgroundImage`, `srcset`, `data-photo`, album-link index, lightbox owner) plus page owner, album title and album-link hrefs; picking the layer and computing position/count happen in `lib/hidden-image.js` (`toHiddenImageCandidates`), so that logic is unit tested. Runs at `document_start`, so a right-click right after load is caught. Owner on album/feed pages comes from `h1.profile-base-info__user-name` (selector from the profile fixture; unverified live on album pages, falls back to `unknown`).
* [x] Keep the parsing pure in `lib/` (candidate selection from the element data) so it is unit tested
* [x] `background.js`: create the menu on install (`documentUrlPatterns` JoyClub, context `all`); on click, ask the content script, build candidates, reuse `firstAvailable` and `startDownload`; red badge + log (task 02) when nothing is found
  * **Note (addition):** a tab without the content script (opened before install/reload) gives `PageNotReadyError`, red badge "reload the page and try again" + log. The catch block of `handleActionClick` moved into the shared `reportFailure`, the single-image download into `saveSingleImage`; `toDownloadCandidates`'s naming part into the shared `imageCandidates` (`lib/lightbox.js`).
* [x] Unit tests for the pure parsing; manifest test for the new permission and content script
* [x] E2E: right-click flow on a fixture page (dispatch `contextmenu` in the page, call the menu handler in the service worker), assert the requested filename
* [x] README and `CLAUDE.md` describe the menu

## Verification

* [ ] (manual testing required) On a profile album grid, the menu saves the full-size jpg of the clicked card, not the overlay GIF (needs a real JoyClub session; real album-grid markup and whether the card background is the full-size image are unknown)
  * **Note:** Fixture flow verified via `tests/e2e/download.spec.js` › "the context menu saves the album card below the overlay under its ZIP name" (transparent overlay `img` on top of `img.secure_image`, `.webp` → `.jpg`, `TestOwner_Fotos-von-uns_02_00000002.jpg`)
* [x] On a lightbox, the menu saves the same file as the toolbar click
  * **Note:** Verified via `tests/e2e/download.spec.js` › "the context menu on a lightbox saves the same file as the toolbar click"
* [x] On a non-JoyClub page the menu does not appear
  * **Note:** Verified via `tests/integration/background.test.js` › "creates the menu on install for JoyClub pages only, in every context" (`documentUrlPatterns`) and `tests/unit/manifest.test.js` › "manifest runs content.js on JoyClub pages only". Playwright cannot open Chrome's context menu; the visible menu is listed as a manual check in the README.
* [x] Right-click on a backdrop (beside the lightbox photo) does not save the photo behind it (added after review)
  * **Note:** Verified via `tests/unit/hidden-image.test.js` › "a backdrop without image hides the photos below it" / "a translucent tint over the photo does not hide it" and `tests/e2e/download.spec.js` › "the context menu on a backdrop does not save the album card behind it" (fails with the rule disabled). Threshold `BACKDROP_MIN_ALPHA` 0.6 vs. JoyClub's real backdrop and hover tints: manual check.
* [x] Right-click on a spot without an image → red badge "image address not found" and a log file
  * **Note:** Verified via `tests/e2e/download.spec.js` › "the context menu on a spot without an image shows the red badge and saves a log" and `tests/integration/background.test.js` › "no image below the pointer shows …"
* [x] `npm test` and `npm run test:e2e` pass
  * **Note:** after the merge with task 03 and the review fix: `npm test` 492 pass, `npm run test:e2e` 18 pass

## Review (2026-10-09)

Fixed: a right-click beside the photo (lightbox or modal backdrop) saved a grid card behind the backdrop, and a `body` background image could win. `content.js` now skips `body`/`html` and sends `backgroundColor`; `toHiddenImageCandidates` stops at a layer without image whose background alpha is ≥ `BACKDROP_MIN_ALPHA`.

Known limitations, not fixed (live markup unknown):
* Album position comes from the `a.album-link` index; `albumEntries` numbers only photos with a source URL. A photo without source shifts the ZIP numbers of later photos, so menu and ZIP names can differ there.
* The menu also shows in JoyClub iframes, where the content script does not run (no `all_frames`); a click there says "reload the page and try again". The same message shows if `describeImageLayers` throws.
* A plain `<img src>` without `srcset` or background image is never chosen (keeps the overlay GIF out); a feed or photo-detail image of that kind gives "image address not found".
* `srcsetOf` (`<picture>` sources) and the lightbox `a.lb_owner_name` owner run against no DOM in tests.
