import {
  FALLBACK_FOLDER,
  UNKNOWN_OWNER,
  extensionFromUrl,
  folderSegment,
  formatTimestamp,
  reserveUniqueName,
  sanitizeSegment,
} from './filename.js';
import { largestJpegUrl, largestSrcsetUrl, toJpgUrl } from './image-url.js';

export class NothingToDownloadError extends Error {
  name = 'NothingToDownloadError';
}

export class AlbumApiError extends Error {
  name = 'AlbumApiError';
}

export const MISSING_REPORT_NAME = 'missing.txt';
export const SKIPPED_REPORT_NAME = 'skipped.txt';
export const MAIN_ALBUM_FALLBACK_TITLE = 'Hauptalbum';
const PROFILE_URL = /^https:\/\/www\.joyclub\.(?:de|com)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?profile\/(?:(?:fotos|fotoalbum)\/)?(\d+)[.-]/;
const LIST_SUCCESS = 'ProfileAlbumListByUserIdSuccess';
const SOURCE_SUCCESS = 'ProfileAlbumImageSourceSuccessResult';
const RESTRICTED_ALBUM = 'ProfileRestrictedRegularAlbum';
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
  const width = entryNumberWidth(urls.length);
  const entries = urls.map((url, index) => {
    const number = String(index + 1).padStart(width, '0');
    const key = photoKey(url);
    const stem = key ? `${owner}_${number}_${key}` : `${owner}_${number}`;
    return { url, name: `${stem}.${extensionFromUrl(url)}` };
  });
  return { zipName: `${owner}_${formatTimestamp(date)}.zip`, entries };
}

// Profile, album-overview or album URL → user id string; otherwise null.
export function profileUserId(url) {
  return PROFILE_URL.exec(url ?? '')?.[1] ?? null;
}

function entryNumberWidth(count) {
  return Math.max(ENTRY_NUMBER_MIN_WIDTH, String(count).length);
}

function sourceUrls(sources) {
  const urls = new Map();
  for (const { id, result } of sources ?? []) {
    const url = result?.__typename === SOURCE_SUCCESS ? largestJpegUrl(result.source?.sourceListJson) : null;
    if (url) urls.set(id, url);
  }
  return urls;
}

function albumEntries(album, owner, urlById, taken) {
  const urls = (album.userImageIdList ?? []).map((id) => urlById.get(id)).filter(Boolean);
  if (urls.length === 0) {
    return [];
  }
  const folder = reserveUniqueName(folderSegment(album.title) || FALLBACK_FOLDER, taken);
  const width = entryNumberWidth(urls.length);
  return urls.map((url, index) => {
    const number = String(index + 1).padStart(width, '0');
    const key = photoKey(url);
    const stem = key ? `${owner}_${folder}_${number}_${key}` : `${owner}_${folder}_${number}`;
    return { url, name: `${folder}/${stem}.${extensionFromUrl(url)}` };
  });
}

// raw = { failed?, owner, mainAlbumTitle, list, sources } from fetchProfileAlbums.
// → { zipName, entries: [{ url, name: '<folder>/<owner>_<folder>_<NN>_<key>.jpg' }], reports: [{ name, text }] }
export function toAlbumZipRequest(raw, date) {
  if (!raw || raw.failed || raw.list?.__typename !== LIST_SUCCESS) {
    throw new AlbumApiError();
  }
  const mainAlbum = {
    title: raw.mainAlbumTitle || MAIN_ALBUM_FALLBACK_TITLE,
    userImageIdList: raw.list.mainAlbum?.userImageIdList,
  };
  const albums = [mainAlbum, ...(raw.list.regularAlbumResultList ?? [])];
  const restricted = albums.filter((album) => album.__typename === RESTRICTED_ALBUM);
  const owner = sanitizeSegment(raw.owner) || UNKNOWN_OWNER;
  const urlById = sourceUrls(raw.sources);
  const taken = new Set([MISSING_REPORT_NAME, SKIPPED_REPORT_NAME]);
  const entries = albums
    .filter((album) => album.__typename !== RESTRICTED_ALBUM)
    .flatMap((album) => albumEntries(album, owner, urlById, taken));
  if (entries.length === 0) {
    throw new NothingToDownloadError();
  }
  const reports = restricted.length > 0 ? [{ name: SKIPPED_REPORT_NAME, text: skippedReport(restricted) }] : [];
  return { zipName: `${owner}_${formatTimestamp(date)}.zip`, entries, reports };
}

// One line per restricted album: '<title> (<n> photos)\n'.
export function skippedReport(albums) {
  return albums.map((album) => `${(album.title ?? '').trim()} (${album.imageCount} photos)\n`).join('');
}

// One URL per line, trailing newline.
export function missingReport(urls) {
  return urls.map((url) => `${url}\n`).join('');
}
