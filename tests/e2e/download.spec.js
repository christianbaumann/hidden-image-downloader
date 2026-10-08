import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';

const LIGHTBOX_URL = 'https://www.joyclub.de/e2e/lightbox';
const NO_LIGHTBOX_URL = 'https://www.joyclub.de/e2e/no-lightbox';
const OTHER_SITE_URL = 'https://example.com/';
const DOWNLOAD_TIMEOUT_MS = 10000;
const EXPECTED_STEM = 'TestOwner_Rück-Ansicht_\\d{4}-\\d{2}-\\d{2}_\\d{6}';

async function serve(page, url, html) {
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
}

async function fixture(name, imageUrl = '') {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return html.replaceAll('__IMAGE_URL__', imageUrl);
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

function downloadState(serviceWorker, id) {
  return serviceWorker.evaluate(async (downloadId) => {
    const [item] = await chrome.downloads.search({ id: downloadId });
    return item?.state;
  }, id);
}

test('downloads the lightbox image as jpg with owner and title in the filename', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', `${imageServer.base}/image.webp`));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toMatch(new RegExp(`^${EXPECTED_STEM}\\.jpg$`));
  expect(result.url).toBe(`${imageServer.base}/image.jpg`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
});

test('falls back to the webp when the server has no jpg', async ({ page, serviceWorker, imageServer }) => {
  await serve(page, LIGHTBOX_URL, await fixture('lightbox.html', `${imageServer.base}/only-webp.webp`));

  const result = await clickAction(serviceWorker);

  expect(result.filename).toMatch(new RegExp(`^${EXPECTED_STEM}\\.webp$`));
  expect(result.url).toBe(`${imageServer.base}/only-webp.webp`);
  await expect.poll(() => downloadState(serviceWorker, result.downloadId), { timeout: DOWNLOAD_TIMEOUT_MS })
    .toBe('complete');
});

test('flags the icon when no lightbox is open', async ({ page, serviceWorker }) => {
  await serve(page, NO_LIGHTBOX_URL, await fixture('no-lightbox.html'));

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('no image open');
});

test('flags the icon on non-JoyClub pages', async ({ page, serviceWorker }) => {
  await serve(page, OTHER_SITE_URL, await fixture('no-lightbox.html'));

  const result = await clickAction(serviceWorker);

  expect(result).toBeNull();
  const badge = await badgeState(serviceWorker);
  expect(badge.text).toBe('!');
  expect(badge.title).toContain('JoyClub pages only');
});
