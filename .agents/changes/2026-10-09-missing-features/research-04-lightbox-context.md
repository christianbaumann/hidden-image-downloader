# Research 04: album context in the lightbox

Question: which JoyClub lightbox pages expose album title, position and photo count, so a single image can be named `<Owner>_<Album>_<nn>_<photo-id>.jpg` like its profile ZIP entry?

## Sources

No live session was available (no cookies; `ref/` and `sandbox/` do not exist in this checkout). Checked only:

- `tests/e2e/fixtures/lightbox.html`, `profile.html`, `no-lightbox.html` (sanitised copies of real pages)
- git history of these fixtures (`40277cf`, `ac1ab7d`)
- `lib/lightbox.js` selectors (`.lightbox_slide.slide_active img.secure_image`, `a.lb_owner_name`, `.lb_img_title`, `aside.lightbox_desktop_bild_titel`)

## Findings (fixtures only)

| Page | Album title | Position / count | Checked |
|---|---|---|---|
| Profile album (`/profile/<id>.…`) | not in the lightbox slide | not in the lightbox slide | fixture only |
| `/profile/fotoalbum/…` | no fixture | no fixture | open |
| Party albums | no fixture | no fixture | open |
| Feed | no fixture | no fixture | open |

- The sanitised lightbox slide holds only the image (`img.secure_image` with `data-photo` and the `background-image` URL), the owner link and the photo title. No album name, no counter like `3 / 12`.
- The fixtures were cut down to what the extension read at the time, so missing markup in them does not prove the live page lacks it.
- On profile, `/profile/fotos/…` and `/profile/fotoalbum/…` URLs the toolbar click takes the ZIP path even with a lightbox open (`profileUserId`). The toolbar lightbox path therefore never runs on those pages. Album context matters there only for the context menu (task 05).
- The ZIP entry key is `photoKey(url)`: the first 8 characters of the UUID path segment of the image URL. If the lightbox `background-image` URL carries the same UUID segment as the API's `sourceListJson` URLs, the single-image name matches the ZIP name. Not verified live.

## Consequence for the implementation

- `buildFilename` and `toDownloadCandidates` accept `album`, `position` (1-based) and `count`, and build the album name when all three are usable. Otherwise `<Owner>_<photo-id>`.
- `<photo-id>` is `photoKey(<image url>)`, falling back to `data-photo`, then `image`.
- `extractLightboxData` does not read album, position or count yet: no selector is known. Adding guessed selectors would repeat the mistake of the main album title.

## Open (needs a live session)

- Lightbox DOM on a profile album, `/profile/fotoalbum/…`, party albums and the feed: album title and counter element, if any.
- Does the lightbox `background-image` URL contain the photo UUID, so `photoKey` matches the ZIP entry?
- Does the counter count all photos or only the visible ones (the ZIP numbers only photos with a source URL)?
