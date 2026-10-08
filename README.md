# hidden-image-downloader

Many websites hide images behind a transparent GIF, so downloading the image just doesn't work. This browser extension (Chrome and Firefox) downloads all such protected images.

## Usage

Currently supports JoyClub (`www.joyclub.de`, `www.joyclub.com`) in Chrome only.

1. Load the extension unpacked via `chrome://extensions` (developer mode).
2. Open a photo in the JoyClub lightbox.
3. Click the toolbar icon. The image is saved to the default download folder as `<Owner>_<Title>_<YYYY-MM-DD_HHmmss>.<ext>`. A `.webp` image is saved as the site's `.jpg` version; if that is missing or does not answer within 5 s, the `.webp` is saved instead.

### Profile photos

With no lightbox open on a profile page, the click saves every photo of the profile's main photo slider as one ZIP, `<Owner>_<YYYY-MM-DD_HHmmss>.zip`. Each entry is named `<Owner>_<nn>_<photo-id>.jpg`, numbered in slider order. Photos that fail to load are listed in `missing.txt` inside the ZIP, and the icon shows an amber `!` badge with the tooltip "n of m photos missing". If no photo loads, no ZIP is saved.

### Errors

If nothing can be downloaded (other site, neither a lightbox nor profile photos, no image address), the icon shows a red `!` badge and its tooltip names the reason. The badge only reports failures before the download starts; later network errors show up in Chrome's download list only.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit + integration tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```

`vendor/jszip.min.js` is JSZip from npm, pinned in `package.json`. To update it, bump the version, run `npm install`, then `cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js` and restore its two header lines. `tests/unit/vendor-jszip.test.js` checks that the copy matches.
