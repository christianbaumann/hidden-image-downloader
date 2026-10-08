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
// Album photos: any UUID serves a jpg, except the one reserved for a missing photo.
const PHOTO_PATH = /^\/[0-9a-f-]{36}\/orig\/image_\d+_\w+\.jpg$/;
export const MISSING_PHOTO_UUID = '00000000-0000-4000-8000-000000000000';
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const JOYCLUB_ORIGIN = 'https://www.joyclub.de';
const TOKEN_URL = `${JOYCLUB_ORIGIN}/webauth/access_token`;
const GRAPH_URL = 'https://apiv2.joyclub.com/graph/';
const GRAPH_CORS = { 'Access-Control-Allow-Origin': JOYCLUB_ORIGIN };

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

// JoyClub's token endpoint and GraphQL API; graphStatus other than 200 fails every GraphQL call.
// context.route also catches the fetches of the injected fetcher.
export async function routeJoyclubApi(context, { list, sources, graphStatus = HTTP_OK }) {
  await context.route(TOKEN_URL, (route) => route.fulfill({
    json: { status_code: HTTP_OK, content: { access_token: 'e2e-token' }, error: null },
  }));
  await context.route(GRAPH_URL, (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: HTTP_NO_CONTENT,
        headers: {
          ...GRAPH_CORS,
          'Access-Control-Allow-Headers': 'authorization, content-type',
          'Access-Control-Allow-Methods': 'POST',
        },
      });
    }
    if (graphStatus !== HTTP_OK) {
      return route.fulfill({ status: graphStatus, headers: GRAPH_CORS, body: '' });
    }
    const data = request.postDataJSON().operationName === 'getProfileAlbumList'
      ? { profileAlbum: { listByUserId: list } }
      : { profileAlbum: { image: { source: { sourceByImageIdList: { itemList: sources } } } } };
    return route.fulfill({ headers: GRAPH_CORS, json: { data } });
  });
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
