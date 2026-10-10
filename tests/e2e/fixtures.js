import { test as base, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEDIA_PLAYLIST, SIGNED, VIDEO_HOST, dataAnswer, listAnswer, masterPlaylist, segmentBytes, signedAnswer, videoItem,
} from '../fixtures/video-api.js';

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
const VIDEO_LIST_URL = `${JOYCLUB_ORIGIN}/video/lightbox/list`;
const VIDEO_DATA_URL = `${JOYCLUB_ORIGIN}/video/lightbox/data`;
const VIDEO_SIGNED_URL = `${JOYCLUB_ORIGIN}/aws/aws_signed_cookies?**`;
// /<guid>/hls/<id>.m3u8 (master), /<guid>/hls/<variant>.m3u8 (media), /<guid>/hls/seg_<n>.ts
const VIDEO_PATH = /^\/[0-9a-f-]{36}\/hls\/(?:(\d+)\.m3u8|([^/]+\.m3u8)|(seg_\d+\.ts))$/;
const HTTP_FORBIDDEN = 403;
const JOYCLUB_HOST = new URL(JOYCLUB_ORIGIN).hostname;
const CERT_DAYS = '1';
const PROMPT_HOST = 'identity.joyclub.com';
const AGECHECK_PATH = '/login/agecheck.html';
const PROMPT_PATH = '/ui/fsk18/challenge/password';
const PROMPT_SUBMIT_PATH = '/ui/fsk18/submit';
export const UNLOCKED_PATH = '/e2e/unlocked';
export const FSK18_PASSWORD = 'e2e-fsk18-password';
const HTTP_FOUND = 302;
const HTML_TYPE = 'text/html; charset=utf-8';

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
// captions: profileAlbum.image of the captions query; profileText / sedCard: profileDescription.byUserId of the profile text
// and sed card queries (null: none).
// videos: ids of the profile's videos (video-api fixture); { id, source: false } is one of a locked FSK18 session.
export async function routeJoyclubApi(context, {
  list, sources, captions = null, profileText = null, sedCard = null, graphStatus = HTTP_OK, messages = [], clubMailStatus = HTTP_OK,
  videos = [],
}) {
  const graphData = {
    getProfileAlbumList: () => ({ profileAlbum: { listByUserId: list } }),
    getProfileAlbumImageSources: () => ({ profileAlbum: { image: { source: { sourceByImageIdList: { itemList: sources } } } } }),
    getProfileAlbumImageCaptions: () => ({ profileAlbum: { image: captions } }),
    getProfileDescriptionByUserId: () => ({ profileDescription: { byUserId: profileText } }),
    getProfileSedCardDataByUserId: () => ({ profileDescription: { byUserId: sedCard } }),
  };
  await context.route(CLUBMAIL_LIST_URL, (route) => (clubMailStatus === HTTP_OK
    ? route.fulfill({ json: { content: { message_list: messages, page_up_parameter: null } } })
    : route.fulfill({ status: clubMailStatus, body: '' })));
  const videoIds = videos.map((video) => video.id ?? video);
  await context.route(VIDEO_LIST_URL, (route) => route.fulfill({ json: listAnswer(videoIds) }));
  await context.route(VIDEO_DATA_URL, (route) => route.fulfill({
    json: dataAnswer(videos.map((video) => videoItem(video.id ?? video, { source: video.source ?? true, title: video.title }))),
  }));
  await context.route(VIDEO_SIGNED_URL, (route) => route.fulfill({ json: signedAnswer() }));
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
    return route.fulfill({ headers: GRAPH_CORS, json: { data: graphData[request.postDataJSON().operationName]() } });
  });
}

// The video host's answers: playlists and TS segments, only with the signed query (as CloudFront does).
function serveVideo(url, response) {
  const match = VIDEO_PATH.exec(url.pathname);
  if (!match) {
    response.writeHead(HTTP_NOT_FOUND).end();
    return;
  }
  if (url.searchParams.get('Signature') !== SIGNED.Signature) {
    response.writeHead(HTTP_FORBIDDEN).end();
    return;
  }
  const [, masterId, mediaName, segmentName] = match;
  if (segmentName) {
    response.writeHead(HTTP_OK, { 'Content-Type': 'video/MP2T' }).end(segmentBytes(segmentName));
    return;
  }
  response.writeHead(HTTP_OK, { 'Content-Type': 'application/vnd.apple.mpegurl' })
    .end(masterId ? masterPlaylist(masterId) : mediaName && MEDIA_PLAYLIST);
}

// A JoyClub page carrying the session's FSK18 status.
export function fsk18StatusPage(session) {
  return `<!doctype html><body data-session-fsk18-status="${session.unlocked ? 1 : 0}">FSK18</body>`;
}

// JoyClub's FSK18 prompt: agecheck → password form → back on JoyClub, unlocked only with FSK18_PASSWORD.
// Answered true when the request was one of them.
async function serveFsk18(url, response, session) {
  if (url.pathname === AGECHECK_PATH) {
    response.writeHead(HTTP_FOUND, { Location: `https://${PROMPT_HOST}${PROMPT_PATH}` }).end();
  } else if (url.hostname === PROMPT_HOST && url.pathname === PROMPT_PATH) {
    const html = await readFile(new URL('./fixtures/fsk18-prompt.html', import.meta.url));
    response.writeHead(HTTP_OK, { 'Content-Type': HTML_TYPE }).end(html);
  } else if (url.hostname === PROMPT_HOST && url.pathname === PROMPT_SUBMIT_PATH) {
    session.submits++;
    session.unlocked = url.searchParams.get('password') === FSK18_PASSWORD;
    const location = session.unlocked ? `${JOYCLUB_ORIGIN}${UNLOCKED_PATH}` : `https://${PROMPT_HOST}${PROMPT_PATH}`;
    response.writeHead(HTTP_FOUND, { Location: location }).end();
  } else if (url.pathname === UNLOCKED_PATH) {
    response.writeHead(HTTP_OK, { 'Content-Type': HTML_TYPE }).end(fsk18StatusPage(session));
  } else {
    return false;
  }
  return true;
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
  // It serves what the offscreen document fetches from JoyClub: the ClubMail attachments and the videos.
  // It also serves the FSK18 prompt: context.route misses the first loads of a tab the extension opens.
  joyclubServer: async ({}, use) => {
    const fsk18 = { unlocked: false, submits: 0 };
    const server = https.createServer(await selfSignedCert(), async (request, response) => {
      const host = request.headers.host?.split(':')[0];
      if (await serveFsk18(new URL(request.url, `https://${host}`), response, fsk18)) {
        return;
      }
      if (request.headers.host?.startsWith(VIDEO_HOST)) {
        serveVideo(new URL(request.url, `https://${VIDEO_HOST}`), response);
        return;
      }
      if (new URL(request.url, JOYCLUB_ORIGIN).pathname !== CLUBMAIL_DOWNLOAD_PATH) {
        response.writeHead(HTTP_NOT_FOUND).end();
        return;
      }
      response.writeHead(HTTP_OK, { 'Content-Type': JPEG.type }).end(JPEG.bytes);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use({ port: server.address().port, fsk18 });
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
        `--host-resolver-rules=MAP ${JOYCLUB_HOST} 127.0.0.1:${joyclubServer.port}, MAP ${VIDEO_HOST} 127.0.0.1:${joyclubServer.port}, MAP ${PROMPT_HOST} 127.0.0.1:${joyclubServer.port}`,
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
