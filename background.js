import { extractLightboxData, toDownloadCandidates, UnsupportedPageError } from './lib/lightbox.js';

const DEFAULT_ACTION_TITLE = 'Download hidden image';
const ERROR_TITLE_PREFIX = 'Hidden Image Downloader: ';
const BADGE_ERROR_TEXT = '!';
const BADGE_ERROR_COLOR = '#d00000';
const CONFLICT_ACTION = 'uniquify';
const PROBE_TIMEOUT_MS = 5000;

// Download URL → filename; download()'s filename is ignored while another extension listens to onDeterminingFilename.
const pendingFilenames = new Map();

class DownloadFailedError extends Error {
  name = 'DownloadFailedError';
}

const ERROR_REASONS = {
  UnsupportedPageError: 'works on JoyClub pages only',
  NoLightboxError: 'no image open in the lightbox',
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

async function showError(tabId, reason) {
  console.warn(reason);
  await updateBadge([
    chrome.action.setBadgeText({ tabId, text: BADGE_ERROR_TEXT }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_ERROR_COLOR }),
    chrome.action.setTitle({ tabId, title: ERROR_TITLE_PREFIX + reason }),
  ]);
}

async function extractFromTab(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: extractLightboxData });
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
      // Unreachable candidate: try the next one.
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
    const raw = await extractFromTab(tab.id);
    const candidates = toDownloadCandidates(raw, new Date());
    const { url, filename } = await firstAvailable(candidates);
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
globalThis.handleActionClick = handleActionClick;
