# hidden-image-downloader

Many websites hide images behind a transparent GIF, so downloading the image just doesn't work. This browser extension (Chrome and Firefox) downloads all such protected images.

## Usage

Currently supports JoyClub (`www.joyclub.de`, `www.joyclub.com`) in Chrome only.

1. Load the extension unpacked via `chrome://extensions` (developer mode).
2. Open a photo in the JoyClub lightbox.
3. Click the toolbar icon. The image is saved to the default download folder as `<Owner>_<Title>_<YYYY-MM-DD_HHmmss>.<ext>`. A `.webp` image is saved as the site's `.jpg` version; if that is missing or does not answer within 5 s, the `.webp` is saved instead.

### Profile photos

On a profile page (`/profile/<id>.…`), its album overview (`/profile/fotos/…`) or one of its albums (`/profile/fotoalbum/…`), the click saves every photo of every album you can see as one ZIP, `<Owner>_<YYYY-MM-DD_HHmmss>.zip`. This applies even with a lightbox open there; use the lightbox on other pages for single photos.

- Each album gets its own folder, named after the album title. Duplicate names get `-2`, `-3`, …
- The main album folder takes the title of its card ("Fotos von uns" → `Fotos-von-uns`). On an album page there is no such card, so the click waits about 3 s and names the folder `Hauptalbum`; the same happens if the card title cannot be read.
- Photos are named `<Album>/<Owner>_<Album>_<nn>_<photo-id>.jpg`, numbered per album in the site's order (`001` once an album has 100 or more photos). `<photo-id>` is the first 8 characters of the photo's ID.
- Albums that need the owner's permission are skipped and listed in `skipped.txt` with their photo count. Empty albums are left out.
- A photo fetch that fails with a network error, timeout, HTTP 429 or 5xx is retried twice (after 1 s and 2 s). Photos that still fail, or answer with another error, are listed in `missing.txt`, and the icon shows an amber `!` badge with the tooltip "n of m photos missing". If no photo loads, no ZIP is saved and the badge says "download failed". If every album is restricted or empty, the badge says "no lightbox image or profile photos found".

You need to be logged in on the domain you are browsing (`joyclub.de` or `joyclub.com`): the extension reads the album list through JoyClub's own API with that session. If that fails, the badge says "album list unavailable".

### Errors

If nothing can be downloaded (other site, neither a lightbox nor profile photos, album list unavailable, no image address, download failed), the icon shows a red `!` badge and its tooltip names the reason. The badge only reports failures before the download starts; later network errors show up in Chrome's download list only.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit + integration tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```

`vendor/jszip.min.js` is JSZip from npm, pinned in `package.json`. To update it, bump the version, run `npm install`, then `cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js` and restore its two header lines. `tests/unit/vendor-jszip.test.js` checks that the copy matches.
