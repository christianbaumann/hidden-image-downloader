import { fetchClubMailImages } from './lib/clubmail.js';
import { extractLightboxData, toDownloadCandidates, UnsupportedPageError } from './lib/lightbox.js';
import { NothingToDownloadError, fetchProfileAlbums, profileUserId, toAlbumZipRequest } from './lib/profile.js';
import { PHASES, overallPercent, progressBadgeText } from './lib/progress.js';

const DEFAULT_ACTION_TITLE = 'Download hidden image';
const BADGE_TITLE_PREFIX = 'Hidden Image Downloader: ';
const BADGE_TEXT = '!';
const BADGE_ERROR_COLOR = '#d00000';
const BADGE_WARNING_COLOR = '#e0a000';
const BADGE_PROGRESS_COLOR = '#1a73e8';
const API_PHASE_TITLE = 'loading album list and ClubMail';
const CONFLICT_ACTION = 'uniquify';
const PROBE_TIMEOUT_MS = 5000;
const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_READY_LIMIT = 50;
const OFFSCREEN_READY_DELAY_MS = 50;
const OFFSCREEN_JUSTIFICATION = 'Build a ZIP of profile photos and hand it to chrome.downloads via a blob URL';
const FINISHED_DOWNLOAD_STATES = new Set(['complete', 'interrupted']);
const CLUBMAIL_UNAVAILABLE = 'ClubMail unavailable';
const WARNING_SEPARATOR = '; ';
const CLUBMAIL_FAILED = { failed: true };

// Download URL → filename; download()'s filename is ignored while another extension listens to onDeterminingFilename.
const pendingFilenames = new Map();
// The offscreen document owns the ZIP blob URLs, so it stays open until every ZIP download has finished.
const zipDownloadIds = new Set();
let activeZipJobs = 0;
// ZIP job id → tab id, so progress from the offscreen document reaches the badge of its own tab.
const zipJobTabs = new Map();
let nextZipJobId = 0;
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

async function showProgress(tabId, text, title) {
  await updateBadge([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_PROGRESS_COLOR }),
    chrome.action.setTitle({ tabId, title: BADGE_TITLE_PREFIX + title }),
  ]);
}

const showApiProgress = (tabId, resolved, count) =>
  showProgress(tabId, `${overallPercent(PHASES.API, resolved, count)}%`, API_PHASE_TITLE);

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

// fetchers: [func, args, fallback?] injected in parallel; the badge counts how many have resolved.
// A fetcher with a fallback answers it instead of failing the click when its injection fails or yields nothing.
// After one fails, later ones leave the badge alone, so they can't paint progress over the error.
async function extractAllWithProgress(tabId, fetchers) {
  let resolved = 0;
  let failed = false;
  await showApiProgress(tabId, resolved, fetchers.length);
  return Promise.all(fetchers.map(async ([func, args, fallback]) => {
    let result;
    try {
      result = await extractFromTab(tabId, func, args) ?? fallback;
    } catch (error) {
      if (fallback === undefined) {
        failed = true;
        throw error;
      }
      result = fallback;
    }
    resolved++;
    if (!failed) {
      await showApiProgress(tabId, resolved, fetchers.length);
    }
    return result;
  }));
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

async function buildZipOffscreen(tabId, entries, reports) {
  const jobId = nextZipJobId++;
  zipJobTabs.set(jobId, tabId);
  let response;
  try {
    await ensureOffscreenDocument();
    response = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'build-zip', jobId, entries, reports });
  } catch {
    throw new DownloadFailedError();
  } finally {
    zipJobTabs.delete(jobId);
  }
  if (!response?.url) {
    throw new DownloadFailedError();
  }
  return response;
}

async function downloadZip(tabId, { zipName, entries, reports = [], clubMailFailed = false }) {
  activeZipJobs++;
  let response;
  let downloadId;
  try {
    response = await buildZipOffscreen(tabId, entries, reports);
    downloadId = await startDownload(response.url, zipName);
  } catch (error) {
    activeZipJobs--;
    await closeOffscreenIfIdle();
    throw error;
  }
  zipDownloadIds.add(downloadId);
  const { url, added, missing } = response;
  const warnings = [
    ...(missing.length > 0 ? [`${missing.length} of ${entries.length} photos missing`] : []),
    ...(clubMailFailed ? [CLUBMAIL_UNAVAILABLE] : []),
  ];
  if (warnings.length > 0) {
    await showWarning(tabId, warnings.join(WARNING_SEPARATOR));
  } else {
    await clearBadge(tabId);
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

// Sync on purpose: a returned promise would count as an async answer to the message.
function onZipProgress(message) {
  if (message?.target !== 'background' || message.action !== 'zip-progress') {
    return;
  }
  const tabId = zipJobTabs.get(message.jobId);
  if (tabId === undefined) {
    return;
  }
  const { done, total } = message;
  showProgress(tabId, progressBadgeText(done, total), `${done} of ${total} photos`);
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
      const [albums, clubMail] = await extractAllWithProgress(tab.id, [
        [fetchProfileAlbums, [userId]],
        [fetchClubMailImages, [userId], CLUBMAIL_FAILED],
      ]);
      return await downloadZip(tab.id, toAlbumZipRequest(albums, date, clubMail));
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
      await clearBadge(tab.id);
      throw error;
    }
    await showError(tab.id, reason);
    return null;
  }
}

chrome.action.onClicked.addListener(handleActionClick);
chrome.downloads.onDeterminingFilename.addListener(suggestOwnFilename);
chrome.downloads.onChanged.addListener(onDownloadChanged);
chrome.runtime.onMessage.addListener(onZipProgress);
globalThis.handleActionClick = handleActionClick;
