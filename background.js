import { extractLightboxData, toDownloadCandidates, UnsupportedPageError } from './lib/lightbox.js';
import { NothingToDownloadError, fetchProfileAlbums, profileUserId, toAlbumZipRequest } from './lib/profile.js';

const DEFAULT_ACTION_TITLE = 'Download hidden image';
const BADGE_TITLE_PREFIX = 'Hidden Image Downloader: ';
const BADGE_TEXT = '!';
const BADGE_ERROR_COLOR = '#d00000';
const BADGE_WARNING_COLOR = '#e0a000';
const CONFLICT_ACTION = 'uniquify';
const PROBE_TIMEOUT_MS = 5000;
const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_READY_LIMIT = 50;
const OFFSCREEN_READY_DELAY_MS = 50;
const OFFSCREEN_JUSTIFICATION = 'Build a ZIP of profile photos and hand it to chrome.downloads via a blob URL';
const FINISHED_DOWNLOAD_STATES = new Set(['complete', 'interrupted']);

// Download URL → filename; download()'s filename is ignored while another extension listens to onDeterminingFilename.
const pendingFilenames = new Map();
// The offscreen document owns the ZIP blob URLs, so it stays open until every ZIP download has finished.
const zipDownloadIds = new Set();
let activeZipJobs = 0;
// Opening and closing the document run one after the other, so overlapping clicks and closes can't collide.
let offscreenQueue = Promise.resolve();

class DownloadFailedError extends Error {
  name = 'DownloadFailedError';
}

const ERROR_REASONS = {
  UnsupportedPageError: 'works on JoyClub pages only',
  NothingToDownloadError: 'no lightbox image or profile photos found',
  AlbumApiError: 'album list unavailable',
  NoImageUrlError: 'image address not found',
  DownloadFailedError: 'download failed',
};

// The tab may close mid-click; its badge is gone then anyway.
async function updateBadge(updates) {
  try {
    await Promise.all(updates);
  } catch {
    console.warn('badge update failed');
  }
}

async function clearBadge(tabId) {
  await updateBadge([
    chrome.action.setBadgeText({ tabId, text: '' }),
    chrome.action.setTitle({ tabId, title: DEFAULT_ACTION_TITLE }),
  ]);
}

async function showBadge(tabId, reason, color) {
  console.warn(reason);
  await updateBadge([
    chrome.action.setBadgeText({ tabId, text: BADGE_TEXT }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setTitle({ tabId, title: BADGE_TITLE_PREFIX + reason }),
  ]);
}

const showError = (tabId, reason) => showBadge(tabId, reason, BADGE_ERROR_COLOR);
const showWarning = (tabId, reason) => showBadge(tabId, reason, BADGE_WARNING_COLOR);

async function extractFromTab(tabId, func, args = []) {
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return injection.result;
  } catch {
    throw new UnsupportedPageError();
  }
}

// HEAD every candidate but the last; the first ok one wins, the last is the unprobed fallback.
async function firstAvailable(candidates) {
  for (const candidate of candidates.slice(0, -1)) {
    try {
      const response = await fetch(candidate.url, {
        method: 'HEAD',
        credentials: 'include',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (response.ok) {
        return candidate;
      }
    } catch {
      console.warn('jpg probe failed');
    }
  }
  return candidates.at(-1);
}

async function startDownload(url, filename) {
  pendingFilenames.set(url, filename);
  try {
    return await chrome.downloads.download({ url, filename, conflictAction: CONFLICT_ACTION, saveAs: false });
  } catch {
    pendingFilenames.delete(url);
    throw new DownloadFailedError();
  }
}

function queueOffscreenTask(task) {
  const run = offscreenQueue.then(task);
  offscreenQueue = run.catch(() => {});
  return run;
}

async function ensureOffscreenDocument() {
  await queueOffscreenTask(async () => {
    if (!await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: OFFSCREEN_JUSTIFICATION,
      });
    }
  });
  for (let attempt = 0; attempt < OFFSCREEN_READY_LIMIT; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'ping' });
      if (response?.ready) {
        return;
      }
    } catch {
      // The document's listener is not registered yet.
    }
    await new Promise((resolve) => setTimeout(resolve, OFFSCREEN_READY_DELAY_MS));
  }
  throw new DownloadFailedError();
}

async function closeOffscreenIfIdle() {
  await queueOffscreenTask(async () => {
    if (activeZipJobs > 0) {
      return;
    }
    try {
      if (await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.closeDocument();
      }
    } catch {
      console.warn('closing the offscreen document failed');
    }
  });
}

async function buildZipOffscreen(entries, reports) {
  let response;
  try {
    await ensureOffscreenDocument();
    response = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'build-zip', entries, reports });
  } catch {
    throw new DownloadFailedError();
  }
  if (!response?.url) {
    throw new DownloadFailedError();
  }
  return response;
}

async function downloadZip(tabId, { zipName, entries, reports = [] }) {
  activeZipJobs++;
  let response;
  let downloadId;
  try {
    response = await buildZipOffscreen(entries, reports);
    downloadId = await startDownload(response.url, zipName);
  } catch (error) {
    activeZipJobs--;
    await closeOffscreenIfIdle();
    throw error;
  }
  zipDownloadIds.add(downloadId);
  const { url, added, missing } = response;
  if (missing.length > 0) {
    await showWarning(tabId, `${missing.length} of ${entries.length} photos missing`);
  }
  return { url, filename: zipName, downloadId, added, missing };
}

async function onDownloadChanged({ id, state }) {
  if (!zipDownloadIds.has(id) || !FINISHED_DOWNLOAD_STATES.has(state?.current)) {
    return;
  }
  zipDownloadIds.delete(id);
  activeZipJobs--;
  await closeOffscreenIfIdle();
}

function suggestOwnFilename(item, suggest) {
  const filename = pendingFilenames.get(item.url);
  if (item.byExtensionId !== chrome.runtime.id || filename === undefined) {
    return;
  }
  pendingFilenames.delete(item.url);
  suggest({ filename, conflictAction: CONFLICT_ACTION });
}

export async function handleActionClick(tab) {
  await clearBadge(tab.id);
  try {
    const date = new Date();
    const userId = profileUserId(tab.url);
    if (userId) {
      const raw = await extractFromTab(tab.id, fetchProfileAlbums, [userId]);
      return await downloadZip(tab.id, toAlbumZipRequest(raw, date));
    }
    const raw = await extractFromTab(tab.id, extractLightboxData);
    if (!raw) {
      throw new NothingToDownloadError();
    }
    const { url, filename } = await firstAvailable(toDownloadCandidates(raw, date));
    const downloadId = await startDownload(url, filename);
    return { url, filename, downloadId };
  } catch (error) {
    const reason = ERROR_REASONS[error.name];
    if (!reason) {
      throw error;
    }
    await showError(tab.id, reason);
    return null;
  }
}

chrome.action.onClicked.addListener(handleActionClick);
chrome.downloads.onDeterminingFilename.addListener(suggestOwnFilename);
chrome.downloads.onChanged.addListener(onDownloadChanged);
globalThis.handleActionClick = handleActionClick;
