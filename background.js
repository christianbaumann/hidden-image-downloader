import { clubMailConversationIds, fetchClubMailImages, withReason } from './lib/clubmail.js';
import {
  LOCKED_STATUS, PASSWORD_KEY, UNLOCKED_STATUS, UNLOCK_FAILED_KEY, Fsk18UnlockError, agecheckUrl, isJoyclubTab,
  isPromptTab, readFsk18Status, submitFsk18Password,
} from './lib/fsk18.js';
import { findHiddenImage, toHiddenImageCandidates } from './lib/hidden-image.js';
import { filterNewEntries, mergeRecord, pendingKey, savedKey, savedRecord } from './lib/incremental.js';
import { extractLightboxData, toDownloadCandidates, UnsupportedPageError } from './lib/lightbox.js';
import { LOG_FILENAME, createLog, logDataUrl, renderLog } from './lib/log.js';
import {
  NothingToDownloadError, fetchPhotoTitle, fetchProfileAlbums, profileUserId, toAlbumZipRequest, toClubMailZipRequest,
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
const VIDEOS_UNAVAILABLE = 'videos unavailable';
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
// Same value as FSK18_STATUS_ACTION in content.js.
const FSK18_STATUS_ACTION = 'fsk18-status';
const TOP_FRAME_ID = 0;
const UNLOCK_POLL_MS = 250;
const UNLOCK_STEP_TIMEOUT_MS = 20000;
// Without a stored password the user types it into the prompt.
const MANUAL_UNLOCK_TIMEOUT_MS = 180000;

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
// The running FSK18 unlock; clicks and locked page loads during it wait for it instead of starting another one.
let unlocking = null;
// Tabs that show JoyClub's FSK18 prompt for the extension; their own page loads never start an unlock.
const unlockTabIds = new Set();
// Tabs a page-load unlock has reloaded and that have not reported unlocked since: a locked report starts no unlock,
// so there is no reload loop.
const reloadedTabIds = new Set();
// Tabs a toolbar click is reading from; a page-load unlock does not reload them under the click.
const clickTabIds = new Set();

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
  Fsk18UnlockError: '18+ unlock failed',
  Fsk18LockedError: 'unlock 18+ first',
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

// warning: the click already warns (ClubMail or videos unavailable), so the ZIP gets log.txt even without missing files.
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

// Badge texts for the fetchers that failed without failing the click.
function fetcherWarnings({ clubMailFailed, clubMailReason, videosFailed, videosReason }) {
  return [
    ...(clubMailFailed ? [withReason(CLUBMAIL_UNAVAILABLE, clubMailReason)] : []),
    ...(videosFailed ? [withReason(VIDEOS_UNAVAILABLE, videosReason)] : []),
  ];
}

// The pending record is stored before anything else is awaited, so it is there when the download finishes.
async function downloadZip(tabId, userId, request, log) {
  const { zipName, entries, reports = [], lastMessageId, profileTextHash } = request;
  const fetcherFailures = fetcherWarnings(request);
  activeZipJobs++;
  let response;
  let downloadId;
  try {
    const root = zipName.slice(0, -ZIP_EXTENSION.length);
    response = await buildZipOffscreen(tabId, { root, entries, reports, warning: fetcherFailures.length > 0 }, log);
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
    ...(missing.length > 0 ? [`${missing.length} of ${entries.length} files missing`] : []),
    ...fetcherFailures,
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
  showProgress(tabId, progressBadgeText(done, total), `${done} of ${total} files`);
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
// Nothing new while ClubMail or the videos failed → amber badge and the log as its own download, since no ZIP holds it.
async function downloadNewFiles(tabId, userId, request, full, log) {
  const { request: filtered, nothingNew } = filterNewEntries(request, full ? undefined : await readSaved(userId));
  log.add(full ? `files: ${request.entries.length}, full` : `files: ${filtered.entries.length} of ${request.entries.length} new`);
  if (!nothingNew) {
    return downloadZip(tabId, userId, filtered, log);
  }
  log.add(NOTHING_NEW);
  const fetcherFailures = fetcherWarnings(request);
  if (fetcherFailures.length > 0) {
    await showWarning(tabId, [NOTHING_NEW, ...fetcherFailures].join(WARNING_SEPARATOR));
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The tab once predicate (sync or async) holds; fails when the tab closes or the time is up.
async function waitForTab(tabId, predicate, timeoutMs, reason) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Fsk18UnlockError('prompt closed');
    }
    if (await predicate(tab)) {
      return tab;
    }
    await sleep(UNLOCK_POLL_MS);
  }
  throw new Fsk18UnlockError(reason);
}

// body[data-session-fsk18-status] of a JoyClub tab; null when unreadable (no JoyClub page).
async function readStatus(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readFsk18Status });
    return injection.result ?? null;
  } catch {
    return null;
  }
}

async function submitPassword(tabId, password) {
  let submitted = false;
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: submitFsk18Password, args: [password] });
    submitted = injection.result === true;
  } catch {
    // Reported below.
  }
  if (!submitted) {
    throw new Fsk18UnlockError('no password field');
  }
}

// One attempt: JoyClub rate-limits wrong passwords. A stored password is typed into a background tab;
// without one the prompt opens in front for the user. Never logs the password.
async function unlockFsk18(tabUrl, log) {
  const { [PASSWORD_KEY]: password } = await chrome.storage.local.get(PASSWORD_KEY);
  log.add(password ? 'fsk18: unlocking' : 'fsk18: unlocking manually');
  const prompt = await chrome.tabs.create({ url: agecheckUrl(tabUrl), active: !password });
  unlockTabIds.add(prompt.id);
  try {
    // A tab that loaded while locked still says so after an unlock elsewhere; JoyClub then shows no prompt.
    const isUnlockedTab = async (tab) => isJoyclubTab(tab) && await readStatus(tab.id) === UNLOCKED_STATUS;
    const first = await waitForTab(prompt.id, async (tab) => isPromptTab(tab) || await isUnlockedTab(tab),
      UNLOCK_STEP_TIMEOUT_MS, 'no password prompt');
    if (!isPromptTab(first)) {
      log.add('fsk18: already unlocked');
      return;
    }
    if (password) {
      await submitPassword(prompt.id, password);
    }
    await waitForTab(prompt.id, isJoyclubTab, password ? UNLOCK_STEP_TIMEOUT_MS : MANUAL_UNLOCK_TIMEOUT_MS,
      'password not accepted');
    if (await readStatus(prompt.id) !== UNLOCKED_STATUS) {
      throw new Fsk18UnlockError('still locked');
    }
    log.add('fsk18: unlocked');
  } catch (error) {
    await chrome.storage.session.set({ [UNLOCK_FAILED_KEY]: true });
    throw error;
  } finally {
    unlockTabIds.delete(prompt.id);
    await chrome.tabs.remove(prompt.id).catch(() => {});
  }
}

function sharedUnlock(tabUrl, log) {
  unlocking ??= unlockFsk18(tabUrl, log).finally(() => {
    unlocking = null;
  });
  return unlocking;
}

// A locked session gets pixelated 18+ photos from the album API, so it is unlocked first.
async function ensureUnlocked(tab, log) {
  const status = await readStatus(tab.id);
  log.add(`fsk18: status ${status ?? 'unknown'}`);
  if (status === LOCKED_STATUS) {
    await sharedUnlock(tab.url, log);
  }
}

// A JoyClub page reported its status (content.js). Locked, with a stored password: unlock once and reload it.
// A failed unlock is not repeated in this browser session, so a wrong password costs one attempt.
// A failure shows the badge only: nobody clicked, so no log is downloaded.
async function onPageLocked(message, sender) {
  const tab = sender?.tab;
  if (message?.action !== FSK18_STATUS_ACTION || sender.frameId !== TOP_FRAME_ID || !tab || unlockTabIds.has(tab.id)) {
    return;
  }
  if (message.status !== LOCKED_STATUS) {
    reloadedTabIds.delete(tab.id);
    return;
  }
  if (reloadedTabIds.has(tab.id)) {
    return;
  }
  const { [PASSWORD_KEY]: password } = await chrome.storage.local.get(PASSWORD_KEY);
  const { [UNLOCK_FAILED_KEY]: failed } = await chrome.storage.session.get(UNLOCK_FAILED_KEY);
  if (!password || failed) {
    return;
  }
  const log = createLog();
  log.add('path: page locked', { url: tab.url });
  try {
    await sharedUnlock(tab.url, log);
    if (!clickTabIds.has(tab.id)) {
      reloadedTabIds.add(tab.id);
      await chrome.tabs.reload(tab.id);
    }
  } catch (error) {
    const reason = ERROR_REASONS[error.name];
    await (reason ? showError(tab.id, withReason(reason, error.reason)) : clearBadge(tab.id));
  }
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
      let albums;
      let clubMail;
      let videos;
      clickTabIds.add(tab.id);
      try {
        await ensureUnlocked(tab, log);
        [albums, clubMail, videos] = await extractAllWithProgress(tab.id, [
          [fetchProfileAlbums, [userId]],
          [fetchClubMailImages, [[userId]], CLUBMAIL_FAILED],
          [fetchProfileVideos, [userId], VIDEOS_FAILED],
        ]);
      } finally {
        clickTabIds.delete(tab.id);
      }
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

// Profile and album pages: the photo's title from the captions API, as in the profile ZIP, unless the lightbox shows one.
// A failed lookup saves without title.
async function captionTitle(tab, { apiPhotoId, names }, log) {
  if (names.title || !apiPhotoId || !profileUserId(tab.url)) {
    return '';
  }
  const title = (await extractFromTab(tab.id, fetchPhotoTitle, [apiPhotoId]).catch(() => null)) ?? null;
  log.add(title === null ? 'title: unavailable' : 'title: from captions');
  return title ?? '';
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
    return await saveSingleImage(toHiddenImageCandidates(raw, await captionTitle(tab, findHiddenImage(raw), log)), log);
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
// Sync wrapper: a returned promise would count as an async answer.
chrome.runtime.onMessage.addListener((message, sender) => {
  onPageLocked(message, sender);
});
globalThis.handleActionClick = handleActionClick;
globalThis.handleMenuClick = handleMenuClick;
