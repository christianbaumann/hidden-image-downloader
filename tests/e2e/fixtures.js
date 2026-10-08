import { test as base, chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 1x1 lossless WebP.
const WEBP = { type: 'image/webp', bytes: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64') };
// JPEG header only; nothing decodes it.
const JPEG = { type: 'image/jpeg', bytes: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2Q==', 'base64') };
// /only-webp.jpg is missing on purpose: the extension must fall back to the webp.
const ROUTES = {
  '/image.webp': WEBP,
  '/image.jpg': JPEG,
  '/only-webp.webp': WEBP,
};
// Profile slider photos: any UUID serves a jpg, except the one reserved for a missing photo.
const PHOTO_PATH = /^\/[0-9a-f-]{36}\/orig\/image_\d+_\w+\.jpg$/;
export const MISSING_PHOTO_UUID = '00000000-0000-4000-8000-000000000000';
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

// The extension probes 127.0.0.1 without host permission, so every answer needs credentialed CORS headers.
function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function imageFor(pathname) {
  if (PHOTO_PATH.test(pathname) && !pathname.startsWith(`/${MISSING_PHOTO_UUID}/`)) {
    return JPEG;
  }
  return ROUTES[pathname];
}

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
  imageServer: async ({}, use) => {
    const server = http.createServer((request, response) => {
      const image = imageFor(new URL(request.url, 'http://localhost').pathname);
      if (!image) {
        response.writeHead(HTTP_NOT_FOUND, corsHeaders(request)).end();
        return;
      }
      response.writeHead(HTTP_OK, { ...corsHeaders(request), 'Content-Type': image.type }).end(image.bytes);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use({ base: `http://127.0.0.1:${server.address().port}` });
    await new Promise((resolve) => server.close(resolve));
  },
});

export { expect } from '@playwright/test';
