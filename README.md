# hidden-image-downloader

Many websites hide images behind a transparent GIF, so downloading the image just doesn't work. This browser extension (Chrome and Firefox) downloads all such protected images.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```
