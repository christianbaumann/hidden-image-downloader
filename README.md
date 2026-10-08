# hidden-image-downloader

Many websites hide images behind a transparent GIF, so downloading the image just doesn't work. This browser extension (Chrome and Firefox) downloads all such protected images.

## Usage

Currently supports JoyClub (`www.joyclub.de`, `www.joyclub.com`) in Chrome only.

1. Load the extension unpacked via `chrome://extensions` (developer mode).
2. Open a photo in the JoyClub lightbox.
3. Click the toolbar icon. The image is saved to the default download folder as `<Owner>_<Title>_<YYYY-MM-DD_HHmmss>.<ext>`. A `.webp` image is saved as the site's `.jpg` version; if that is missing or does not answer within 5 s, the `.webp` is saved instead.

If nothing can be downloaded (other site, no open lightbox, no image address), the icon shows a red `!` badge and its tooltip names the reason. The badge only reports failures before the download starts; later network errors show up in Chrome's download list only.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit + integration tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```
