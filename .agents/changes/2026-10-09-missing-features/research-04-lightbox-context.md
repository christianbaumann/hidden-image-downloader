# Research 04: album context in the lightbox

Question: which JoyClub pages expose album title, position and photo count, so a single image can be named `<Owner>_<Album>_<nn>_<photo-id>.jpg` like its profile ZIP entry?

## Method

Live session on 2026-10-09 (playwright-cli, user's cookies), plus the sanitised fixtures in `tests/e2e/fixtures/`. The DOM of the active lightbox slide was dumped and searched for album names and counters. The order check ran the extension's own `fetchProfileAlbums` in the page.

## Findings

| Page | Lightbox | Album title | Position / count | Toolbar path |
|---|---|---|---|---|
| Album page `/profile/fotoalbum/<id>.…` | yes (`.lightbox_slide.slide_active`) | not in the lightbox; page has `h2.profile-headline` ("Fotos von uns") | not in the lightbox; page has `a.album-link` per photo (`#media_id_0_<imageId>_…`) | ZIP (`profileUserId`) |
| Profile page `/profile/<id>.…` | yes | not checked further: ZIP path | — | ZIP |
| Friends feed `/my_joy/feed/friends/` | no: photo cards link to the album page (`a.feed-image-ui` → `/profile/fotoalbum/…#media_id_…`) | — | — | lightbox → "no lightbox image …" |
| Photo detail `/fotos/detail/…` | no: one image in `.image-ui.layout-adaptive.big` (`picture`/`srcset`) | none | none | lightbox → "no lightbox image …" |
| Party albums | not found in the session (time-boxed) | — | — | — |

- The lightbox slide never shows an album title or an "n / m" counter. It has the owner (`a.lb_owner_name`), the title (`.lb_img_title`), `img.secure_image[data-photo=<imageId>]` and the image URL.
- The image URL is `https://image-user.feig-partner.de/<uuid>/…`, so `photoKey(url)` gives the same id as the ZIP entry.
- On the album page, the order of `a.album-link` equals the API's `userImageIdList` (checked for a main album with 7 photos). Position = index of the lightbox's `data-photo` among the links + 1, count = number of links.
- The ZIP names the main album folder "Hauptalbum" when the click runs on the album page (no main card there). The album page's `h2.profile-headline` holds the real title, so that fallback could go (backlog).

## Consequence

- The toolbar lightbox path runs only on non-profile URLs, and none of those has album context. The toolbar name is therefore always `<Owner>_<photo-id>.<ext>`.
- Album context exists only on the album page (`h2.profile-headline`, `a.album-link` order). Only the context menu (task 05) can use it there, since the toolbar takes the ZIP path on that URL.
- `buildFilename`/`toDownloadCandidates` already accept `album`, `position`, `count`; task 05 fills them.
