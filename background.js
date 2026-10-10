import { clubMailConversationIds, fetchClubMailImages, withReason } from './lib/clubmail.js';
import { toHiddenImageCandidates } from './lib/hidden-image.js';
import { filterNewEntries, mergeRecord, pendingKey, savedKey, savedRecord } from './lib/incremental.js';
import { extractLightboxData, toDownloadCandidates, UnsupportedPageError } from './lib/lightbox.js';
import { LOG_FILENAME, createLog, logDataUrl, renderLog } from './lib/log.js';
import {
  NothingToDownloadError, fetchProfileAlbums, profileUserId, toAlbumZipRequest, toClubMailZipRequest,
} from './lib/profile.js';
import { PHASES, overallPercent, progressBadgeText } from './lib/progress.js';
import { fetchProfileVideos } from './lib/video.js';

const DEFAULT_ACTION_TITLE = 'Download hidden image';
const BADGE_TITLE_PREFIX = 'Hidden Image Downloader: ';
const BADGE_TEXT = '!';
const BADGE_ERROR_COLOR = '#d00000';
const BADGE_WARNING_COLOR = '#e0a000';
const BADGE_PROGRESS_COLOR = '#1a73e8';
const BADGE_NEUTRAL_COLOR = '#5f6368';
const NOTHING_NEW_TEXT = '✓';
const NOTHING_NEW = 'nothing new';
const API_PHASE_TITLE = 'loading album list, videos and ClubMail';
const CONFLICT_ACTION = 'uniquify';
const PROBE_TIMEOUT_MS = 5000;
const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_READY_LIMIT = 50;
const OFFSCREEN_READY_DELAY_MS = 50;
const OFFSCREEN_JUSTIFICATION = 'Build a ZIP of profile photos and hand it to chrome.downloads via a blob URL';
const FINISHED_DOWNLOAD_STATES = new Set(['complete', 'interrupted']);
const DOWNLOAD_COMPLETE = 'complete';
const CLUBMAIL_UNAVAILABLE = 'ClubMail unavailable';
const WARNING_SEPARATOR = '; ';
const INJECTION_FAILED_REASON = 'extension could not run on the page';
const CLUBMAIL_FAILED = { failed: true, reason: INJECTION_FAILED_REASON };
const VIDEOS_FAILED = { failed: true, reason: INJECTION_FAILED_REASON };
const ZIP_EXTENSION = '.zip';
const ZIP_WITHOUT_URL_REASON = 'no ZIP in the answer';
const MENU_ID = 'save-hidden-image';
const MENU_TITLE = 'Save hidden image';
// Every page context; 'all' would also put the item on the toolbar icon's menu.
const MENU_CONTEXTS = ['page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio'];
const FULL_MENU_ID = 'download-everything-again';
const FULL_MENU_TITLE = 'Download everything again';
const FULL_MENU_CONTEXTS = ['action'];
const JOYCLUB_PAGES = ['https://www.joyclub.de/*', 'https://www.joyclub.com/*'];
// Same value as DESCRIBE_ACTION in content.js.
const DESCRIBE_IMAGE_ACTION = 'describe-hidden-image';

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
// Merges into saved:<userId> run one after the other, so two finished downloads can't drop each other's keys.
let recordQueue = Promise.resolve();

class DownloadFailedError extends Error {
  name = 'DownloadFailedError';
}

class PageNotReadyError extends Error {
  name = 'PageNotReadyError';
}

const ERROR_REASONS = {
  UnsupportedPageError: 'works on JoyClub pages only',
  NothingToDownloadError: 'no lightbox image or profile photos found',
  AlbumApiError: 'album list unavailable',
  ClubMailApiError: CLUBMAIL_UNAVAILABLE,
  NoImageUrlError: 'image address not found',
  DownloadFailedError: 'download failed',
  PageNotReadyError: 'reload the page and try again',
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

async function showNothingNew(tabId) {
  await updateBadge([
    chrome.action.setBadgeText({ tabId, text: NOTHING_NEW_TEXT }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_NEUTRAL_COLOR }),
    chrome.action.setTitle({ tabId, title: BADGE_TITLE_PREFIX + NOTHING_NEW }),
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
async function firstAvailable(candidates, log) {
  for (const candidate of candidates.slice(0, -1)) {
    try {
      const response = await fetch(candidate.url, {
        method: 'HEAD',
        credentials: 'include',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      log.add('probe', { status: response.status, url: candidate.url });
      if (response.ok) {
        return candidate;
      }
    } catch (error) {
      log.add('probe', { reason: error.name, url: candidate.url });
      console.warn('probe failed');
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

// warning: the click already warns (ClubMail unavailable), so the ZIP gets log.txt even without missing photos.
async function buildZipOffscreen(tabId, { root, entries, reports, warning }, log) {
  const jobId = nextZipJobId++;
  zipJobTabs.set(jobId, tabId);
  let response;
  try {
    await ensureOffscreenDocument();
    response = await chrome.runtime.sendMessage({
      target: 'offscreen', action: 'build-zip', jobId, root, entries, reports,
      log: { startedAt: log.startedAt, lines: [...log.lines] }, warning,
    });
    log.append(response?.logLines ?? []);
  } catch (error) {
    log.add('zip: build failed', { reason: error.name });
    throw new DownloadFailedError();
  } finally {
    zipJobTabs.delete(jobId);
  }
  if (!response?.url) {
    log.add('zip: build failed', { reason: ZIP_WITHOUT_URL_REASON });
    throw new DownloadFailedError();
  }
  return response;
}

// The ZIP is already on its way, so a failing write only leaves its files unrecorded.
async function rememberPending(downloadId, userId, record, log) {
  try {
    await chrome.storage.session.set({ [pendingKey(downloadId)]: { userId, record } });
  } catch (error) {
    log.add('record: not saved', { reason: error.name });
    console.warn('saving the pending record failed');
  }
}

// The pending record is stored before anything else is awaited, so it is there when the download finishes.
async function downloadZip(tabId, userId, {
  zipName, entries, reports = [], clubMailFailed = false, clubMailReason, lastMessageId, profileTextHash,
}, log) {
  activeZipJobs++;
  let response;
  let downloadId;
  try {
    const root = zipName.slice(0, -ZIP_EXTENSION.length);
    response = await buildZipOffscreen(tabId, { root, entries, reports, warning: clubMailFailed }, log);
    const unsupported = response.unsupported?.length ? `, ${response.unsupported.length} unsupported` : '';
    log.add(`zip: ${response.added} added, ${response.missing.length} missing${unsupported}`);
    downloadId = await startDownload(response.url, zipName);
  } catch (error) {
    activeZipJobs--;
    await closeOffscreenIfIdle();
    throw error;
  }
  zipDownloadIds.add(downloadId);
  await rememberPending(downloadId, userId, savedRecord(entries, response.missing, lastMessageId, profileTextHash), log);
  const { url, added, missing } = response;
  log.add('download started');
  const warnings = [
    ...(missing.length > 0 ? [`${missing.length} of ${entries.length} photos missing`] : []),
    ...(clubMailFailed ? [withReason(CLUBMAIL_UNAVAILABLE, clubMailReason)] : []),
  ];
  if (warnings.length > 0) {
    await showWarning(tabId, warnings.join(WARNING_SEPARATOR));
  } else {
    await clearBadge(tabId);
  }
  return { url, filename: zipName, downloadId, added, missing };
}

async function readSaved(userId) {
  const key = savedKey(userId);
  return (await chrome.storage.local.get(key))[key];
}

// pending:<downloadId> lives in storage.session, so it outlasts a service worker restart during the download.
async function settlePendingRecord(downloadId, state) {
  const key = pendingKey(downloadId);
  const pending = (await chrome.storage.session.get(key))[key];
  if (!pending) {
    return;
  }
  await chrome.storage.session.remove(key);
  if (state !== DOWNLOAD_COMPLETE) {
    return;
  }
  const merge = async () => chrome.storage.local.set({
    [savedKey(pending.userId)]: mergeRecord(await readSaved(pending.userId), pending.record),
  });
  const run = recordQueue.then(merge);
  recordQueue = run.catch(() => {});
  await run;
}

async function onDownloadChanged({ id, state }) {
  if (!FINISHED_DOWNLOAD_STATES.has(state?.current)) {
    return;
  }
  if (zipDownloadIds.has(id)) {
    zipDownloadIds.delete(id);
    activeZipJobs--;
    await closeOffscreenIfIdle();
  }
  await settlePendingRecord(id, state.current);
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

function logAlbums(log, albums) {
  log.add(albums?.failed ? 'albums: failed' : `albums: ${albums?.sources?.length ?? 0} photo sources`);
}

function logVideos(log, videos) {
  if (!Array.isArray(videos?.videos)) {
    log.add('videos: failed', { reason: videos?.reason });
    return;
  }
  log.add(`videos: ${videos.videos.filter((video) => video.source).length} of ${videos.videos.length} with source`);
}

function logClubMail(log, clubMail) {
  if (clubMail?.failed || !clubMail?.messages) {
    log.add('clubmail: failed', { reason: clubMail?.reason });
    return;
  }
  log.add(`clubmail: ${clubMail.messages.length} messages`);
}

// A failing log download must not hide the error it describes.
async function downloadLog(log) {
  try {
    await startDownload(logDataUrl(renderLog(log)), LOG_FILENAME);
  } catch {
    console.warn('log download failed');
  }
}

// full: skip the record of saved files. Nothing new and no new message → no ZIP, neutral badge.
// Nothing new while ClubMail failed → amber badge and the log as its own download, since no ZIP holds it.
async function downloadNewFiles(tabId, userId, request, full, log) {
  const { request: filtered, nothingNew } = filterNewEntries(request, full ? undefined : await readSaved(userId));
  log.add(full ? `files: ${request.entries.length}, full` : `files: ${filtered.entries.length} of ${request.entries.length} new`);
  if (!nothingNew) {
    return downloadZip(tabId, userId, filtered, log);
  }
  log.add(NOTHING_NEW);
  if (request.clubMailFailed) {
    await showWarning(tabId, [NOTHING_NEW, withReason(CLUBMAIL_UNAVAILABLE, request.clubMailReason)].join(WARNING_SEPARATOR));
    await downloadLog(log);
  } else {
    await showNothingNew(tabId);
  }
  return { nothingNew: true };
}

async function saveSingleImage(candidates, log) {
  const { url, filename } = await firstAvailable(candidates, log);
  const downloadId = await startDownload(url, filename);
  log.add('download started', { url });
  return { url, filename, downloadId };
}

// Known errors: red badge and log, answer null. Unexpected errors: log, then rethrow.
async function reportFailure(tabId, log, error) {
  const reason = ERROR_REASONS[error.name];
  // Unexpected errors log only their name: their message may hold page data.
  log.add(`error: ${error.name}`, { reason: reason && withReason(reason, error.reason) });
  if (!reason) {
    await clearBadge(tabId);
    await downloadLog(log);
    throw error;
  }
  await showError(tabId, withReason(reason, error.reason));
  await downloadLog(log);
  return null;
}

// full: true saves every file again ("Download everything again").
export async function handleActionClick(tab, { full = false } = {}) {
  await clearBadge(tab.id);
  const log = createLog();
  try {
    const date = new Date();
    const conversationIds = clubMailConversationIds(tab.url);
    if (conversationIds) {
      log.add('path: conversation', { url: tab.url });
      const [clubMail] = await extractAllWithProgress(tab.id, [[fetchClubMailImages, [conversationIds], CLUBMAIL_FAILED]]);
      logClubMail(log, clubMail);
      return await downloadNewFiles(tab.id, clubMail.partnerId, toClubMailZipRequest(clubMail, date), full, log);
    }
    const userId = profileUserId(tab.url);
    if (userId) {
      log.add('path: profile', { url: tab.url });
      const [albums, clubMail, videos] = await extractAllWithProgress(tab.id, [
        [fetchProfileAlbums, [userId]],
        [fetchClubMailImages, [[userId]], CLUBMAIL_FAILED],
        [fetchProfileVideos, [userId], VIDEOS_FAILED],
      ]);
      logAlbums(log, albums);
      logVideos(log, videos);
      logClubMail(log, clubMail);
      return await downloadNewFiles(tab.id, userId, toAlbumZipRequest(albums, date, clubMail, videos), full, log);
    }
    log.add('path: lightbox', { url: tab.url });
    const raw = await extractFromTab(tab.id, extractLightboxData);
    if (!raw) {
      throw new NothingToDownloadError();
    }
    return await saveSingleImage(toDownloadCandidates(raw), log);
  } catch (error) {
    return reportFailure(tab.id, log, error);
  }
}

// The content script is missing in tabs opened before the extension was installed or reloaded.
async function describeHiddenImage(tabId, frameId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: DESCRIBE_IMAGE_ACTION }, { frameId });
  } catch {
    throw new PageNotReadyError();
  }
}

export async function handleMenuClick(info, tab) {
  if (info.menuItemId === FULL_MENU_ID) {
    return handleActionClick(tab, { full: true });
  }
  if (info.menuItemId !== MENU_ID) {
    return null;
  }
  await clearBadge(tab.id);
  const log = createLog();
  try {
    log.add('path: context menu', { url: tab.url });
    const raw = await describeHiddenImage(tab.id, info.frameId);
    return await saveSingleImage(toHiddenImageCandidates(raw), log);
  } catch (error) {
    return reportFailure(tab.id, log, error);
  }
}

function createMenu() {
  chrome.contextMenus.create({
    id: MENU_ID, title: MENU_TITLE, contexts: MENU_CONTEXTS, documentUrlPatterns: JOYCLUB_PAGES,
  });
  chrome.contextMenus.create({ id: FULL_MENU_ID, title: FULL_MENU_TITLE, contexts: FULL_MENU_CONTEXTS });
}

chrome.action.onClicked.addListener((tab) => handleActionClick(tab));
chrome.runtime.onInstalled.addListener(createMenu);
chrome.contextMenus.onClicked.addListener(handleMenuClick);
chrome.downloads.onDeterminingFilename.addListener(suggestOwnFilename);
chrome.downloads.onChanged.addListener(onDownloadChanged);
chrome.runtime.onMessage.addListener(onZipProgress);
globalThis.handleActionClick = handleActionClick;
globalThis.handleMenuClick = handleMenuClick;
