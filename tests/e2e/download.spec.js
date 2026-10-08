import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, MISSING_PHOTO_UUID } from './fixtures.js';

const LIGHTBOX_URL = 'https://www.joyclub.de/e2e/lightbox';
const PROFILE_URL = 'https://www.joyclub.de/e2e/profile';
const NOTHING_URL = 'https://www.joyclub.de/e2e/nothing';
const SECOND_PHOTO_UUID = '22222222-2222-4222-8222-222222222222';
const OTHER_SITE_URL = 'https://example.com/';
const DOWNLOAD_TIMEOUT_MS = 10000;
const EXPECTED_STEM = 'TestOwner_Rück-Ansicht_\\d{4}-\\d{2}-\\d{2}_\\d{6}';

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

function downloadItem(serviceWorker, id) {
  return serviceWorker.evaluate(async (downloadId) => {
    const [item] = await chrome.downloads.search({ id: downloadId });
    return item && { state: item.state, filename: item.filename };
  }, id);
}

async function downloadState(serviceWorker, id) {
  return (await downloadItem(serviceWorker, id))?.state;
}

// Waits for the download, then lists the entries of the ZIP on disk.
async function zipEntries(serviceWorker, downloadId) {
  await expect.poll(() => downloadState(serviceWorker, downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
  const { filename } = await downloadItem(serviceWorker, downloadId);
  const zip = await JSZip.loadAsync(await readFile(filename));
  return Object.keys(zip.files).sort();
}

function hasOffscreenDocument(serviceWorker) {
  return serviceWorker.evaluate(() => chrome.offscreen.hasDocument());
}

function profileFixture(imageServer, secondUuid = SECOND_PHOTO_UUID) {
  return fixture('profile.html', { __IMAGE_BASE__: imageServer.base, __SECOND_UUID__: secondUuid });
}

test('downloads the lightbox image as jpg with owner and title in the filename', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', { __IMAGE_URL__: `${imageServer.base}/image.webp` }));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toMatch(new RegExp(`^${EXPECTED_STEM}\\.jpg$`));
  expect(result.url).toBe(`${imageServer.base}/image.jpg`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
});

test('falls back to the webp when the server has no jpg', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', { __IMAGE_URL__: `${imageServer.base}/only-webp.webp` }));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toMatch(new RegExp(`^${EXPECTED_STEM}\\.webp$`));
  expect(result.url).toBe(`${imageServer.base}/only-webp.webp`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
});

test('downloads the profile slider photos as one ZIP', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, PROFILE_URL, await profileFixture(imageServer));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toMatch(/^TestOwner_\d{4}-\d{2}-\d{2}_\d{6}\.zip$/);
  expect(await zipEntries(serviceWorker, result.downloadId))
    .toEqual(['TestOwner_01_11111111.jpg', 'TestOwner_02_22222222.jpg']);
  expect((await badgeState(serviceWorker)).text).toBe('');
  await expect.poll(() => hasOffscreenDocument(serviceWorker), { timeout: DOWNLOAD_TIMEOUT_MS }).toBe(false);
});

test('lists a missing profile photo in missing.txt and warns', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, PROFILE_URL, await profileFixture(imageServer, MISSING_PHOTO_UUID));

  const result = await clickAction(serviceWorker);

  expect(await zipEntries(serviceWorker, result.downloadId)).toEqual(['TestOwner_01_11111111.jpg', 'missing.txt']);
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('1 of 2 photos missing');
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
