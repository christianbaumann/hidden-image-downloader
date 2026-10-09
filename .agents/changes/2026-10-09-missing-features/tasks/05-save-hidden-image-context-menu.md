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

* [ ] `manifest.json`: `contextMenus` permission; `content_scripts` for `https://www.joyclub.de/*` and `https://www.joyclub.com/*`
* [ ] Content script: store the last `contextmenu` position; on request, use `elementsFromPoint` to find the first `img.secure_image`, `background-image` or `srcset` below the overlay and return `{ url or srcset, owner, album, position, count, photoId, pageUrl }`
* [ ] Keep the parsing pure in `lib/` (candidate selection from the element data) so it is unit tested
* [ ] `background.js`: create the menu on install (`documentUrlPatterns` JoyClub, context `all`); on click, ask the content script, build candidates, reuse `firstAvailable` and `startDownload`; red badge + log (task 02) when nothing is found
* [ ] Unit tests for the pure parsing; manifest test for the new permission and content script
* [ ] E2E: right-click flow on a fixture page (dispatch `contextmenu` in the page, call the menu handler in the service worker), assert the requested filename
* [ ] README and `CLAUDE.md` describe the menu

## Verification

* [ ] On a profile album grid, the menu saves the full-size jpg of the clicked card, not the overlay GIF
* [ ] On a lightbox, the menu saves the same file as the toolbar click
* [ ] On a non-JoyClub page the menu does not appear
* [ ] Right-click on a spot without an image → red badge "image address not found" and a log file
* [ ] `npm test` and `npm run test:e2e` pass
