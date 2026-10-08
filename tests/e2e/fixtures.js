import { test as base, chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGE_PATH = '/image.webp';
// 1x1 lossless WebP.
const IMAGE_BYTES = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_ROOT}`,
        `--load-extension=${EXTENSION_ROOT}`,
        // The routed JoyClub page loads its image from the local server; skip Chrome's permission prompt for that.
        '--disable-features=LocalNetworkAccessChecks',
      ],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? await context.newPage());
  },
  serviceWorker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'));
  },
  imageUrl: async ({}, use) => {
    const server = http.createServer((request, response) => {
      if (request.url !== IMAGE_PATH) {
        response.writeHead(HTTP_NOT_FOUND).end();
        return;
      }
      response.writeHead(HTTP_OK, { 'Content-Type': 'image/webp' }).end(IMAGE_BYTES);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use(`http://127.0.0.1:${server.address().port}${IMAGE_PATH}`);
    await new Promise((resolve) => server.close(resolve));
  },
});

export { expect } from '@playwright/test';
