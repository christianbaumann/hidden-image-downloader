import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, MISSING_PHOTO_UUID, routeJoyclubApi } from './fixtures.js';
import { listResult, sourcesResult, testUuid } from '../fixtures/album-api.js';
import { ME, attachmentMessage, textMessage } from '../fixtures/clubmail-api.js';

const LIGHTBOX_URL = 'https://www.joyclub.de/e2e/lightbox';
const PROFILE_URL = 'https://www.joyclub.de/profile/1000001.testowner.html';
const CONVERSATION_URL = 'https://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-1000002-1000001/';
const NOTHING_URL = 'https://www.joyclub.de/e2e/nothing';
const ALBUM_PAGE_URL = 'https://www.joyclub.de/profile/fotoalbum/1000001.testowner.html';
const FEED_URL = 'https://www.joyclub.de/e2e/feed';
const FRAME_URL = 'https://www.joyclub.de/e2e/frame';
const MENU_ITEM_ID = 'save-hidden-image';
// A spot below every fixture's content, where no image is.
const EMPTY_SPOT = { x: 600, y: 500 };
const HTTP_SERVER_ERROR = 500;
const HTTP_NOT_FOUND = 404;
const ALBUM_LIST = listResult({
  main: ['101'],
  albums: [
    { id: '201', title: 'Aktuelles', ids: ['102'] },
    { id: '202', title: 'Lady', restricted: true, imageCount: 9, restrictionReason: 'NEEDS_PERMISSION_BY_OWNER' },
  ],
});
const GREETING = textMessage('10', { from: ME, content: 'Hi <img class="joy_smiley" src="//cfnimg.joyclub.de/smile/x.gif" alt=":-)"> &amp; <a href="javascript:alert(1)">bye</a>' });
const CLUBMAIL_MESSAGES = [
  GREETING,
  attachmentMessage('11', 'e2e-a1', { content: 'Photo', reply: GREETING }),
  attachmentMessage('12', 'e2e-a2'),
  attachmentMessage('13', 'e2e-a3', { from: ME }),
];
const RESTRICTED_ONLY_LIST = listResult({ albums: [{ id: '202', title: 'Lady', restricted: true, imageCount: 9 }] });
const OTHER_SITE_URL = 'https://example.com/';
const DOWNLOAD_TIMEOUT_MS = 10000;
// #e0a000 as getBadgeBackgroundColor reports it.
const WARNING_COLOR_RGBA = [224, 160, 0, 255];
// #d00000 as getBadgeBackgroundColor reports it.
const ERROR_COLOR_RGBA = [208, 0, 0, 255];
const EXPECTED_STEM = 'TestOwner_1001';

async function serve(page, url, html) {
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
}

// placeholders: { __NAME__: value } replaced throughout the fixture.
async function fixture(name, placeholders = {}) {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return Object.entries(placeholders).reduce((result, [key, value]) => result.replaceAll(key, value), html);
}

// Playwright cannot click the toolbar icon, so the click handler is called from the service worker.
function clickAction(serviceWorker) {
  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return globalThis.handleActionClick(tab);
  });
}

function badgeState(serviceWorker) {
  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return {
      text: await chrome.action.getBadgeText({ tabId: tab.id }),
      title: await chrome.action.getTitle({ tabId: tab.id }),
    };
  });
}

// Records every badge text the extension sets from now on; read them with recordedBadgeTexts.
function recordBadgeTexts(serviceWorker) {
  return serviceWorker.evaluate(() => {
    const setBadgeText = chrome.action.setBadgeText.bind(chrome.action);
    globalThis.badgeTexts = [];
    chrome.action.setBadgeText = (details) => {
      globalThis.badgeTexts.push(details.text);
      return setBadgeText(details);
    };
  });
}

function recordedBadgeTexts(serviceWorker) {
  return serviceWorker.evaluate(() => globalThis.badgeTexts);
}

function downloadItem(serviceWorker, id) {
  return serviceWorker.evaluate(async (downloadId) => {
    const [item] = await chrome.downloads.search({ id: downloadId });
    return item && { state: item.state, filename: item.filename };
  }, id);
}

async function downloadState(serviceWorker, id) {
  return (await downloadItem(serviceWorker, id))?.state;
}

// Waits for the download, then opens the ZIP on disk.
async function loadZip(serviceWorker, downloadId) {
  await expect.poll(() => downloadState(serviceWorker, downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
  const { filename } = await downloadItem(serviceWorker, downloadId);
  return JSZip.loadAsync(await readFile(filename));
}

// The top folder every ZIP extracts into: the ZIP's name without '.zip'.
function zipRoot({ filename }) {
  return `${filename.replace(/\.zip$/, '')}/`;
}

// Entry names below the top folder; fails when an entry lies outside it.
async function zipEntries(serviceWorker, result) {
  const root = zipRoot(result);
  const names = Object.keys((await loadZip(serviceWorker, result.downloadId)).files).sort();
  expect(names.filter((name) => !name.startsWith(root))).toEqual([]);
  return names.filter((name) => name !== root).map((name) => name.slice(root.length));
}

async function zipText(serviceWorker, result, name) {
  return (await loadZip(serviceWorker, result.downloadId)).file(zipRoot(result) + name).async('string');
}

// Downloads of the failure log: the only data: URLs the extension downloads.
function logDownloadIds(serviceWorker) {
  return serviceWorker.evaluate(async () =>
    (await chrome.downloads.search({ urlRegex: '^data:text/plain' })).map(({ id }) => id));
}

async function logFileText(serviceWorker) {
  await expect.poll(() => logDownloadIds(serviceWorker), { timeout: DOWNLOAD_TIMEOUT_MS }).toHaveLength(1);
  const [id] = await logDownloadIds(serviceWorker);
  await expect.poll(() => downloadState(serviceWorker, id), { timeout: DOWNLOAD_TIMEOUT_MS }).toBe('complete');
  return readFile((await downloadItem(serviceWorker, id)).filename, 'utf8');
}

function badgeColor(serviceWorker) {
  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return chrome.action.getBadgeBackgroundColor({ tabId: tab.id });
  });
}

function hasOffscreenDocument(serviceWorker) {
  return serviceWorker.evaluate(() => chrome.offscreen.hasDocument());
}

async function serveProfile(page, imageServer, {
  secondUuid = testUuid(2), graphStatus, list = ALBUM_LIST, messages, clubMailStatus,
} = {}) {
  const sources = sourcesResult([{ id: '101', uuid: testUuid(1) }, { id: '102', uuid: secondUuid }], imageServer.base);
  await routeJoyclubApi(page.context(), { list, sources, graphStatus, messages, clubMailStatus });
  await serve(page, PROFILE_URL, await fixture('profile.html', { __IMAGE_URL__: `${imageServer.base}/image.webp` }));
}

test('downloads the lightbox image as <Owner>_<photo-id>.jpg', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', { __IMAGE_URL__: `${imageServer.base}/image.webp` }));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toBe(`${EXPECTED_STEM}.jpg`);
  expect(result.url).toBe(`${imageServer.base}/image.jpg`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
  expect(await logDownloadIds(serviceWorker)).toEqual([]);
});

test('falls back to the webp when the server has no jpg', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', { __IMAGE_URL__: `${imageServer.base}/only-webp.webp` }));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toBe(`${EXPECTED_STEM}.webp`);
  expect(result.url).toBe(`${imageServer.base}/only-webp.webp`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
});

test('downloads every accessible album into its own folder', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer);

  const result = await clickAction(serviceWorker);

  expect(result.filename).toBe('TestOwner.zip');
  expect(await zipEntries(serviceWorker, result)).toEqual([
    'Aktuelles/',
    'Aktuelles/TestOwner_Aktuelles_01_00000002.jpg',
    'Fotos-von-uns/',
    'Fotos-von-uns/TestOwner_Fotos-von-uns_01_00000001.jpg',
    'skipped.txt',
  ]);
  expect((await badgeState(serviceWorker)).text).toBe('');
  await expect.poll(() => hasOffscreenDocument(serviceWorker), { timeout: DOWNLOAD_TIMEOUT_MS }).toBe(false);
  expect(await logDownloadIds(serviceWorker)).toEqual([]);
});

test('shows the ZIP progress on the badge before clearing it', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer);
  await recordBadgeTexts(serviceWorker);

  const result = await clickAction(serviceWorker);

  await zipEntries(serviceWorker, result);
  const texts = await recordedBadgeTexts(serviceWorker);
  expect(texts.slice(0, 4)).toEqual(['', '0%', '5%', '10%']);
  expect(texts).toContain('1/2');
  expect(texts.at(-1)).toBe('');
  expect(await badgeState(serviceWorker)).toEqual({ text: '', title: 'Download hidden image' });
});

test('adds the ClubMail attachments to the album ZIP', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer, { messages: CLUBMAIL_MESSAGES });

  const result = await clickAction(serviceWorker);

  expect(await zipEntries(serviceWorker, result)).toEqual([
    'Aktuelles/',
    'Aktuelles/TestOwner_Aktuelles_01_00000002.jpg',
    'ClubMail/',
    'ClubMail/Own/',
    'ClubMail/Own/TestMe_ClubMail_01_e2e-a3.jpg',
    'ClubMail/TestOwner_ClubMail_01_e2e-a1.jpg',
    'ClubMail/TestOwner_ClubMail_02_e2e-a2.jpg',
    'ClubMail/conversation.html',
    'ClubMail/conversation.md',
    'Fotos-von-uns/',
    'Fotos-von-uns/TestOwner_Fotos-von-uns_01_00000001.jpg',
    'skipped.txt',
  ]);
  const transcript = await zipText(serviceWorker, result, 'ClubMail/conversation.md');
  expect(transcript).toMatch(/^# ClubMail with TestOwner\nExported \d{4}-\d{2}-\d{2} \d{2}:\d{2} · 4 messages\n\n## 2026-09-30\n/);
  expect(transcript).toContain('**TestMe** · 21:10\nHi :-) & bye\n');
  expect(transcript).toContain('**TestOwner** · 21:11\n> Reply to TestMe, 2026-09-30 21:10: Hi :-) & bye\n\nPhoto\n\n![attachment](TestOwner_ClubMail_01_e2e-a1.jpg)\n');
  expect(transcript).toContain('**TestOwner** · 21:12\n![attachment](TestOwner_ClubMail_02_e2e-a2.jpg)\n');
  expect(transcript).toContain('**TestMe** · 21:13\n![attachment](Own/TestMe_ClubMail_01_e2e-a3.jpg)\n');
  const html = await zipText(serviceWorker, result, 'ClubMail/conversation.html');
  expect([...html.matchAll(/<img src="([^"]+)"/g)].map(([, src]) => src))
    .toEqual(['TestOwner_ClubMail_01_e2e-a1.jpg', 'TestOwner_ClubMail_02_e2e-a2.jpg', 'Own/TestMe_ClubMail_01_e2e-a3.jpg']);
  expect(html).toContain('<p>Hi :-) &amp; bye</p>');
  expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  expect((await badgeState(serviceWorker)).text).toBe('');
});

test('a failing ClubMail API still saves the album ZIP and warns', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer, { messages: CLUBMAIL_MESSAGES, clubMailStatus: HTTP_SERVER_ERROR });

  const result = await clickAction(serviceWorker);

  expect(await zipEntries(serviceWorker, result)).not.toContain('ClubMail/');
  expect(await zipText(serviceWorker, result, 'skipped.txt')).toBe('Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nClubMail: unavailable (HTTP 500)\n');
  expect(await zipText(serviceWorker, result, 'log.txt')).toContain('clubmail: failed  reason=HTTP 500');
  expect(await badgeState(serviceWorker)).toEqual({ text: '!', title: 'Hidden Image Downloader: ClubMail unavailable (HTTP 500)' });
  expect(await badgeColor(serviceWorker)).toEqual(WARNING_COLOR_RGBA);
});

test('a profile with only restricted albums saves the ClubMail attachments', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer, { list: RESTRICTED_ONLY_LIST, messages: CLUBMAIL_MESSAGES });

  const result = await clickAction(serviceWorker);

  expect(await zipEntries(serviceWorker, result)).toEqual([
    'ClubMail/',
    'ClubMail/Own/',
    'ClubMail/Own/TestMe_ClubMail_01_e2e-a3.jpg',
    'ClubMail/TestOwner_ClubMail_01_e2e-a1.jpg',
    'ClubMail/TestOwner_ClubMail_02_e2e-a2.jpg',
    'ClubMail/conversation.html',
    'ClubMail/conversation.md',
    'skipped.txt',
  ]);
});

async function serveConversation(page, { clubMailStatus } = {}) {
  await routeJoyclubApi(page.context(), { list: ALBUM_LIST, sources: [], messages: CLUBMAIL_MESSAGES, clubMailStatus });
  await serve(page, CONVERSATION_URL, await fixture('conversation.html'));
}

test('an open conversation saves a ClubMail-only ZIP named after the partner', async ({ page, serviceWorker }) => {
  const requests = [];
  page.context().on('request', (request) => requests.push(request.url()));
  await serveConversation(page);

  const result = await clickAction(serviceWorker);

  expect(result.filename).toBe('TestOwner_ClubMail.zip');
  expect(await zipEntries(serviceWorker, result)).toEqual([
    'ClubMail/',
    'ClubMail/Own/',
    'ClubMail/Own/TestMe_ClubMail_01_e2e-a3.jpg',
    'ClubMail/TestOwner_ClubMail_01_e2e-a1.jpg',
    'ClubMail/TestOwner_ClubMail_02_e2e-a2.jpg',
    'ClubMail/conversation.html',
    'ClubMail/conversation.md',
  ]);
  expect(await zipText(serviceWorker, result, 'ClubMail/conversation.md'))
    .toMatch(/^# ClubMail with TestOwner\nExported \d{4}-\d{2}-\d{2} \d{2}:\d{2} · 4 messages\n/);
  const html = await zipText(serviceWorker, result, 'ClubMail/conversation.html');
  expect([...html.matchAll(/<div class="([^"]+)">/g)].map(([, name]) => name)).toEqual(['message own', 'message', 'message', 'message own']);
  expect(requests.some((url) => url.includes('get_latest_message_list_of_conversation'))).toBe(true);
  expect(requests.some((url) => url.includes('graph') || url.includes('access_token'))).toBe(false);
  expect(requests.some((url) => url.includes('read_conversation'))).toBe(false);
  expect((await badgeState(serviceWorker)).text).toBe('');
});

test('a failing ClubMail API on a conversation shows the red badge', async ({ page, serviceWorker }) => {
  await serveConversation(page, { clubMailStatus: HTTP_SERVER_ERROR });

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  expect(await badgeState(serviceWorker)).toEqual({ text: '!', title: 'Hidden Image Downloader: ClubMail unavailable (HTTP 500)' });
  expect(await badgeColor(serviceWorker)).toEqual(ERROR_COLOR_RGBA);
});

test('lists a missing album photo in missing.txt and log.txt and warns', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer, { secondUuid: MISSING_PHOTO_UUID });

  const result = await clickAction(serviceWorker);

  expect(await zipEntries(serviceWorker, result)).toEqual([
    'Fotos-von-uns/',
    'Fotos-von-uns/TestOwner_Fotos-von-uns_01_00000001.jpg',
    'log.txt',
    'missing.txt',
    'skipped.txt',
  ]);
  const [missingUrl] = (await zipText(serviceWorker, result, 'missing.txt')).split('\n');
  const log = await zipText(serviceWorker, result, 'log.txt');
  expect(log).toContain('path: profile');
  expect(log).toContain(`photo: missing  entry=Aktuelles/TestOwner_Aktuelles_01_00000000.jpg  `);
  expect(log).toContain(`status=${HTTP_NOT_FOUND}  url=${missingUrl.split('?')[0]}\n`);
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('1 of 2 photos missing');
});

test('shows "album list unavailable" when the API fails', async ({ page, serviceWorker, imageServer }) => {
  await serveProfile(page, imageServer, { graphStatus: HTTP_SERVER_ERROR });

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('album list unavailable');
});

test('flags the icon when there is neither a lightbox nor profile photos', async ({ page, serviceWorker }) => {
  await serve(page, NOTHING_URL, await fixture('no-lightbox.html'));

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('no lightbox image or profile photos found');
});

test('flags the icon on non-JoyClub pages', async ({ page, serviceWorker }) => {
  await serve(page, OTHER_SITE_URL, await fixture('no-lightbox.html'));

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('JoyClub pages only');
});

test('saves a failure log that names the reason on non-JoyClub pages', async ({ page, serviceWorker }) => {
  await serve(page, OTHER_SITE_URL, await fixture('no-lightbox.html'));

  await clickAction(serviceWorker);

  const text = await logFileText(serviceWorker);
  expect(text).toMatch(/^Hidden Image Downloader log\n/);
  expect(text).toContain('path: lightbox');
  expect(text).toContain('error: UnsupportedPageError  reason=works on JoyClub pages only');
});

// Center of the first element matching selector, in viewport coordinates.
async function centerOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Fires a right-click at point in the frame (the page by default); Playwright cannot open Chrome's context menu,
// so the menu click is handed to the service worker's handler with the frame's Chrome frameId.
async function saveHiddenImageAt(page, serviceWorker, point, frame = page.mainFrame()) {
  await frame.evaluate(({ x, y }) => document.elementFromPoint(x, y).dispatchEvent(
    new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true }),
  ), point);
  return serviceWorker.evaluate(async ({ menuItemId, frameUrl }) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => location.href });
    const { frameId } = frames.find(({ result }) => result === frameUrl);
    return globalThis.handleMenuClick({ menuItemId, frameId }, tab);
  }, { menuItemId: MENU_ITEM_ID, frameUrl: frame.url() });
}

test('the context menu saves the album card below the overlay under its ZIP name', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, ALBUM_PAGE_URL, await fixture('album.html', { __IMAGE_BASE__: imageServer.base }));

  const result = await saveHiddenImageAt(page, serviceWorker, await centerOf(page, 'a.album-link:nth-of-type(2)'));

  expect(result.filename).toBe('TestOwner_Fotos-von-uns_02_00000002.jpg');
  expect(result.url).toBe(`${imageServer.base}/${testUuid(2)}/orig/image_1920_k.jpg`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
  expect((await badgeState(serviceWorker)).text).toBe('');
});

test('the context menu on a lightbox saves the same file as the toolbar click', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', { __IMAGE_URL__: `${imageServer.base}/image.webp` }));

  const menuResult = await saveHiddenImageAt(page, serviceWorker, await centerOf(page, '.slide_active img.secure_image'));
  const toolbarResult = await clickAction(serviceWorker);

  expect(menuResult.filename).toBe(`${EXPECTED_STEM}.jpg`);
  expect({ url: menuResult.url, filename: menuResult.filename })
    .toEqual({ url: toolbarResult.url, filename: toolbarResult.filename });
});

test('the context menu on a spot without an image shows the red badge and saves a log', async ({ page, serviceWorker }) => {
  await serve(page, NOTHING_URL, await fixture('no-lightbox.html'));

  const result = await saveHiddenImageAt(page, serviceWorker, EMPTY_SPOT);

  expect(result).toBeNull();
  expect(await badgeState(serviceWorker)).toEqual({ text: '!', title: 'Hidden Image Downloader: image address not found' });
  expect(await badgeColor(serviceWorker)).toEqual(ERROR_COLOR_RGBA);
  const text = await logFileText(serviceWorker);
  expect(text).toContain('path: context menu');
  expect(text).toContain('error: NoImageUrlError  reason=image address not found');
});

test('the context menu on a backdrop does not save the album card behind it', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, ALBUM_PAGE_URL, await fixture('album.html', { __IMAGE_BASE__: imageServer.base }));
  await page.evaluate(() => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.85);';
    document.body.append(backdrop);
  });

  const result = await saveHiddenImageAt(page, serviceWorker, await centerOf(page, 'a.album-link:nth-of-type(2)'));

  expect(result).toBeNull();
  expect((await badgeState(serviceWorker)).title).toBe('Hidden Image Downloader: image address not found');
});

test('the context menu saves a feed member card from its picture sources under the card user name', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, FEED_URL, await fixture('feed.html', { __IMAGE_BASE__: imageServer.base }));

  const result = await saveHiddenImageAt(page, serviceWorker, await centerOf(page, '.picture-ui:not(.gated)'));

  expect(result.filename).toBe('CardUser_00000003.jpg');
  expect(result.url).toBe(`${imageServer.base}/${testUuid(3)}/orig/image_1920_k.jpg`);
});

test('the context menu keeps the served size of a photo behind the FSK18 gate', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, FEED_URL, await fixture('feed.html', { __IMAGE_BASE__: imageServer.base }));

  const result = await saveHiddenImageAt(page, serviceWorker, await centerOf(page, '.picture-ui.gated'));

  expect(result.url).toBe(`${imageServer.base}/${testUuid(4)}/orig/image_180_k.jpg`);
});

test('the context menu saves the image below the pointer inside a JoyClub iframe', async ({ page, serviceWorker, imageServer }) => {
  await page.route(FEED_URL, async (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: await fixture('feed.html', { __IMAGE_BASE__: imageServer.base }),
  }));
  await serve(page, FRAME_URL, await fixture('frame.html', { __FRAME_URL__: FEED_URL }));
  const frame = page.frame({ url: FEED_URL });
  await frame.waitForSelector('.picture-ui');

  const result = await saveHiddenImageAt(page, serviceWorker, await centerOf(frame, '.picture-ui:not(.gated)'), frame);

  expect(result.filename).toBe('CardUser_00000003.jpg');
});
