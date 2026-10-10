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

* [ ] Live check: `data-photo` and the `#media_id_0_<id>_` id are the id `profileAlbum.image.byIdList` takes; record the result in this task. If not, stop and update the design
* [ ] Self-contained injected function: token → `getProfileAlbumImageCaptions` for one id → raw title, `null` on any failure
* [ ] `handleMenuClick` calls it on profile and album pages and passes the title to `buildFilename`; a failure saves without title and adds a log line
* [ ] Unit, integration and E2E coverage (title found, placeholder, API failure)
* [ ] Update `README.md` and `CLAUDE.md`

## Verification

* [ ] On an album page, "Save hidden image" saves the same name as the photo's ZIP entry, title included
* [ ] A failing captions call still saves the image, without title
* [ ] The menu click on non-profile pages makes no captions call
* [ ] `npm test` and `npm run test:e2e` pass
