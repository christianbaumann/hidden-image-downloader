import { UNKNOWN_OWNER, extensionFromUrl, formatTimestamp, sanitizeSegment } from './filename.js';
import { largestSrcsetUrl, toJpgUrl } from './image-url.js';

export class NothingToDownloadError extends Error {
  name = 'NothingToDownloadError';
}

export const MISSING_REPORT_NAME = 'missing.txt';
const ENTRY_NUMBER_MIN_WIDTH = 2;
const PHOTO_KEY_LENGTH = 8;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Injected via chrome.scripting.executeScript: must stay self-contained.
export function extractProfileSliderData() {
  const slider = document.querySelector('.profile-main-album-slider');
  if (!slider) {
    return null;
  }
  const items = Array.from(slider.querySelectorAll('j-card.profile-main-album-slider__card'), (card) => {
    const source = card.querySelector('source[type="image/webp"]')
      ?? card.querySelector('source[type="image/jpeg"]');
    return { srcset: source?.getAttribute('srcset') ?? '' };
  });
  return {
    owner: document.querySelector('h1.profile-base-info__user-name')?.textContent.trim() ?? '',
    pageUrl: window.location.href,
    items,
  };
}

// UUID path segment → first 8 chars; otherwise null.
export function photoKey(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const firstSegment = pathname.split('/')[1] ?? '';
  return UUID_SEGMENT.test(firstSegment) ? firstSegment.slice(0, PHOTO_KEY_LENGTH) : null;
}

// → { zipName, entries: [{ url, name }] }; throws NothingToDownloadError when raw is null or no item has a usable srcset.
export function toZipRequest(raw, date) {
  if (!raw) {
    throw new NothingToDownloadError();
  }
  const urls = raw.items
    .map((item) => largestSrcsetUrl(item.srcset, raw.pageUrl))
    .filter((url) => url !== null)
    .map(toJpgUrl);
  if (urls.length === 0) {
    throw new NothingToDownloadError();
  }
  const owner = sanitizeSegment(raw.owner) || UNKNOWN_OWNER;
  const width = Math.max(ENTRY_NUMBER_MIN_WIDTH, String(urls.length).length);
  const entries = urls.map((url, index) => {
    const number = String(index + 1).padStart(width, '0');
    const key = photoKey(url);
    const stem = key ? `${owner}_${number}_${key}` : `${owner}_${number}`;
    return { url, name: `${stem}.${extensionFromUrl(url)}` };
  });
  return { zipName: `${owner}_${formatTimestamp(date)}.zip`, entries };
}

// One URL per line, trailing newline.
export function missingReport(urls) {
  return urls.map((url) => `${url}\n`).join('');
}
