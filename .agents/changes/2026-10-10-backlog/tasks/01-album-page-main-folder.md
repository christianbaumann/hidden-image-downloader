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

* [x] In `fetchProfileAlbums`, decide by `location.pathname`: `/profile/fotoalbum/<uid>.<slug>.html` reads the headline (same rule as `content.js`, repeated inside the injected function) without waiting; `/profile/fotoalbum/<uid>-<albumId>.<slug>.html` uses no title at once (→ "Hauptalbum"); other pages keep the card wait
* [x] Unit tests: `stubDocument` gets `location` and `h2.profile-headline`; cases for both album page kinds (title, no wait); update the "gives up on a page without album cards" case
* [ ] (manual testing required) Live check: a regular album page's headline equals the API title of the album id in its URL; record the result in this task. **Note:** No session cookies available in this run; needs the user's exported cookies (see `CLAUDE.md`, live check)
* [x] Add a sanitised fixture `tests/e2e/fixtures/album-regular.html` and an E2E ZIP test on both album pages (main folder name, no ~3 s wait)
* [x] Update `README.md` (album page note, `:22`) and the `CLAUDE.md` note "JoyClub renders profile album cards client-side"

## Verification

* [x] On a main album page the ZIP's main folder and entry names use the headline title, matching the context menu name of the same photo. **Note:** Verified via unit test `a main album page takes the last headline before the photos at once` and E2E `the ZIP on a main album page names the main folder Fotos-von-uns …` (same `album.html` as the context menu test, which names `TestOwner_Fotos-von-uns_<nn>_…`)
* [x] On a regular album page the main folder is "Hauptalbum" and the ZIP starts without the card wait. **Note:** Verified via unit test `a regular album page gives an empty main title at once, not its own headline` and E2E `the ZIP on a regular album page …` (click < 3 s)
* [x] Profile and `/profile/fotos/…` pages keep the card wait and their titles. **Note:** Verified via unit tests `an album overview page waits for the main card like the profile page`, `gives up on a profile page without album cards after the wait limit` and the existing card-wait cases; E2E `downloads every accessible album into its own folder`
* [x] The own profile's earlier "Account" headline is not taken as the album title. **Note:** Verified via unit tests (headlines `Account`, title, `Kommentare` after the photos) and E2E `album.html` (has the `Account` headline)
* [x] `npm test` and `npm run test:e2e` pass. **Note:** 684 unit/integration, 30 E2E passed
