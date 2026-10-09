import { test as base, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
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
const CLUBMAIL_LIST_URL = `${JOYCLUB_ORIGIN}/clubmailv3/get_latest_message_list_of_conversation`;
const CLUBMAIL_DOWNLOAD_PATH = '/clubmailv3/attachment/download/';
const JOYCLUB_HOST = new URL(JOYCLUB_ORIGIN).hostname;
const CERT_DAYS = '1';

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

// JoyClub's token endpoint, GraphQL API and ClubMail; graphStatus / clubMailStatus other than 200 fail those calls.
// messages: one page of ClubMail messages. context.route also catches the fetches of the injected fetchers.
export async function routeJoyclubApi(context, {
  list, sources, graphStatus = HTTP_OK, messages = [], clubMailStatus = HTTP_OK,
}) {
  await context.route(CLUBMAIL_LIST_URL, (route) => (clubMailStatus === HTTP_OK
    ? route.fulfill({ json: { content: { message_list: messages, page_up_parameter: null } } })
    : route.fulfill({ status: clubMailStatus, body: '' })));
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

// Self-signed certificate for the JoyClub host, created per run so no key is committed.
async function selfSignedCert() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hid-e2e-cert-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile,
    '-days', CERT_DAYS, '-subj', `/CN=${JOYCLUB_HOST}`], { stdio: 'ignore' });
  const cert = { key: await readFile(keyFile), cert: await readFile(certFile) };
  await rm(dir, { recursive: true });
  return cert;
}

export const test = base.extend({
  // context.route does not reach the offscreen document, so Chrome resolves the JoyClub host to this server.
  // It serves what the offscreen document fetches from JoyClub: the ClubMail attachments.
  joyclubServer: async ({}, use) => {
    const server = https.createServer(await selfSignedCert(), (request, response) => {
      if (new URL(request.url, JOYCLUB_ORIGIN).pathname !== CLUBMAIL_DOWNLOAD_PATH) {
        response.writeHead(HTTP_NOT_FOUND).end();
        return;
      }
      response.writeHead(HTTP_OK, { 'Content-Type': JPEG.type }).end(JPEG.bytes);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use({ port: server.address().port });
    await new Promise((resolve) => server.close(resolve));
  },
  context: async ({ joyclubServer }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_ROOT}`,
        `--load-extension=${EXTENSION_ROOT}`,
        // The routed JoyClub page loads its image from the local server; skip Chrome's permission prompt for that.
        '--disable-features=LocalNetworkAccessChecks',
        `--host-resolver-rules=MAP ${JOYCLUB_HOST} 127.0.0.1:${joyclubServer.port}`,
        '--ignore-certificate-errors',
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
