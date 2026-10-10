---
id: 01
dependencies: []
---

# Task 01: Album page main folder from the headline

A profile ZIP started on an album page names the main album folder like the context menu does and starts without the ~3 s card wait: main album page → headline title, regular album page → "Hauptalbum" at once.

## References

* `design.md#item-1-album-page-main-folder`
* `design.md#the-url-decides-the-main-album-title-on-album-pages`
* `design.md#live-check-of-a-regular-album-page`
* `lib/profile.js` (`fetchProfileAlbums`, `TITLE_WAIT_MS`, `MAIN_ALBUM_HREF`, `MAIN_ALBUM_FALLBACK_TITLE`)
* `content.js` (`albumTitle`: last `h2.profile-headline` before the first `a.album-link`)
* `../2026-10-09-missing-features/research-04-lightbox-context.md`
* `tests/unit/profile.test.js` (`describe('fetchProfileAlbums')`, `stubDocument`), `tests/e2e/fixtures/album.html`, `tests/e2e/download.spec.js`

## Work

* [ ] In `fetchProfileAlbums`, decide by `location.pathname`: `/profile/fotoalbum/<uid>.<slug>.html` reads the headline (same rule as `content.js`, repeated inside the injected function) without waiting; `/profile/fotoalbum/<uid>-<albumId>.<slug>.html` uses no title at once (→ "Hauptalbum"); other pages keep the card wait
* [ ] Unit tests: `stubDocument` gets `location` and `h2.profile-headline`; cases for both album page kinds (title, no wait); update the "gives up on a page without album cards" case
* [ ] Live check: a regular album page's headline equals the API title of the album id in its URL; record the result in this task
* [ ] Add a sanitised fixture `tests/e2e/fixtures/album-regular.html` and an E2E ZIP test on both album pages (main folder name, no ~3 s wait)
* [ ] Update `README.md` (album page note, `:22`) and the `CLAUDE.md` note "JoyClub renders profile album cards client-side"

## Verification

* [ ] On a main album page the ZIP's main folder and entry names use the headline title, matching the context menu name of the same photo
* [ ] On a regular album page the main folder is "Hauptalbum" and the ZIP starts without the card wait
* [ ] Profile and `/profile/fotos/…` pages keep the card wait and their titles
* [ ] The own profile's earlier "Account" headline is not taken as the album title
* [ ] `npm test` and `npm run test:e2e` pass
