import { MISSING_REPORT_NAME, SKIPPED_REPORT_NAME, missingReport } from './profile.js';
import { bestVariant, parseMasterPlaylist, parseMediaPlaylist, remuxToMp4, withQuery } from './hls.js';
import { unsupportedVideosLine } from './video.js';
import { ZIP_LOG_NAME, createLog, renderLog } from './log.js';

export const FETCH_CONCURRENCY = 5;
export const FETCH_RETRIES = 2;
export const RETRY_BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const ZIP_MIME = 'application/zip';
const PHOTO = { label: 'photo', credentials: 'include' };
// The signed query authorises the video; JoyClub's cookies are not needed there.
const VIDEO = { label: 'video', credentials: 'omit' };
const ENCRYPTED = 'encrypted';
// buildZip result for a video whose stream cannot be read: listed in skipped.txt, neither added nor missing.
const UNSUPPORTED = Symbol('unsupported');

// Runs fn over items with at most `limit` in flight; results keep input order.
export async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// failure: an HTTP status, or the value a fetch threw (network error, timeout).
export function isRetryable(failure) {
  if (typeof failure !== 'number') {
    return true;
  }
  return failure === HTTP_TOO_MANY_REQUESTS || failure >= HTTP_SERVER_ERROR_MIN;
}

function failureFields(failure, { url, name }) {
  const fields = { entry: name, url };
  return typeof failure === 'number' ? { ...fields, status: failure } : { ...fields, reason: failure?.name };
}

// → ArrayBuffer, or null once the fetch failed for good; transient failures are retried with backoff.
// url: what to fetch, defaults to entry.url (a video fetches its playlists and segments under its own entry).
async function fetchBytes(fetch, entry, delay, log, { label, credentials } = PHOTO, url = entry.url) {
  let failure;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      const response = await fetch(url, { credentials, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) {
        return await response.arrayBuffer();
      }
      failure = response.status;
    } catch (error) {
      failure = error;
    }
    if (!isRetryable(failure) || attempt === FETCH_RETRIES) {
      break;
    }
    log.add(`${label}: retry`, failureFields(failure, { ...entry, url }));
  }
  log.add(`${label}: missing`, failureFields(failure, { ...entry, url }));
  console.warn(typeof failure === 'number' ? `${label} fetch failed: HTTP ${failure}` : `${label} fetch failed`);
  return null;
}

// entry.hls.query: CloudFront signed-URL parameters, appended to every playlist and segment URL.
// → mp4 bytes, null once a fetch or the remux failed, or UNSUPPORTED for an encrypted stream.
// Takes the variant with the highest bandwidth; segments are fetched one after the other.
async function fetchVideo(fetch, entry, delay, log, muxjs) {
  const fetchSigned = (url) => fetchBytes(fetch, entry, delay, log, VIDEO, withQuery(url, entry.hls.query));
  const fetchText = async (url) => {
    const bytes = await fetchSigned(url);
    return bytes && new TextDecoder().decode(bytes);
  };
  const master = await fetchText(entry.url);
  if (master === null) {
    return null;
  }
  const variant = bestVariant(parseMasterPlaylist(master, entry.url));
  const mediaUrl = variant?.url ?? entry.url;
  const media = variant ? await fetchText(mediaUrl) : master;
  if (media === null) {
    return null;
  }
  const { segments, encrypted } = parseMediaPlaylist(media, mediaUrl);
  if (encrypted) {
    log.add('video: unsupported', { entry: entry.name, reason: ENCRYPTED });
    return UNSUPPORTED;
  }
  const parts = [];
  for (const segment of segments) {
    const bytes = await fetchSigned(segment);
    if (!bytes) {
      return null;
    }
    parts.push(bytes);
  }
  let mp4 = null;
  try {
    mp4 = parts.length > 0 ? remuxToMp4(parts, muxjs) : null;
  } catch {
    // A corrupt stream costs this video only, not the ZIP.
  }
  if (!mp4) {
    log.add('video: missing', { entry: entry.name, reason: parts.length > 0 ? 'remux failed' : 'no segments' });
  }
  return mp4;
}

// skipped.txt gains a line for the unsupported videos; created when the request had none.
function withUnsupportedVideos(reports, count) {
  if (count === 0) {
    return reports;
  }
  const line = unsupportedVideosLine(count, ENCRYPTED);
  const skipped = reports.find(({ name }) => name === SKIPPED_REPORT_NAME);
  return skipped
    ? reports.map((report) => (report === skipped ? { ...report, text: report.text + line } : report))
    : [{ name: SKIPPED_REPORT_NAME, text: line }, ...reports];
}

// → { blob: Blob|null, added: number, missing: string[], unsupported: string[], logLines }; blob is null when no entry was added,
// unless there were no entries and reports exist (a ZIP of reports only).
// root: folder that holds every file, so all ZIPs extract into one top folder.
// onProgress(done, total) runs after each entry's last fetch attempt, successful or not.
// log: { startedAt, lines } of the click so far. logLines: the retries and failures of the fetches.
// log.txt (click log plus logLines) is written when photos are missing or `warning` is set.
// Entries with `hls` are videos: fetched as HLS and remuxed to mp4 with muxjs; encrypted ones are `unsupported`.
export async function buildZip(entries, {
  JSZip, muxjs, fetch, limit = FETCH_CONCURRENCY, reports = [], root, delay = sleep, onProgress = () => {},
  log = { startedAt: Date.now(), lines: [] }, warning = false,
}) {
  const fetchLog = createLog(Date.now, log.startedAt);
  let done = 0;
  const bytes = await mapWithLimit(entries, limit, async (entry) => {
    const result = entry.hls
      ? await fetchVideo(fetch, entry, delay, fetchLog, muxjs)
      : await fetchBytes(fetch, entry, delay, fetchLog);
    onProgress(++done, entries.length);
    return result;
  });
  const zip = new JSZip();
  const folder = root ? zip.folder(root) : zip;
  const missing = [];
  const unsupported = [];
  entries.forEach(({ url, name }, index) => {
    if (bytes[index] === UNSUPPORTED) {
      unsupported.push(url);
    } else if (bytes[index]) {
      folder.file(name, bytes[index]);
    } else {
      missing.push(url);
    }
  });
  const added = entries.length - missing.length - unsupported.length;
  const logLines = fetchLog.lines;
  if (added === 0 && (entries.length > 0 || reports.length === 0)) {
    return { blob: null, added, missing, unsupported, logLines };
  }
  if (missing.length > 0) {
    folder.file(MISSING_REPORT_NAME, missingReport(missing));
  }
  for (const { name, text } of withUnsupportedVideos(reports, unsupported.length)) {
    folder.file(name, text);
  }
  if (missing.length > 0 || warning) {
    folder.file(ZIP_LOG_NAME, renderLog({ startedAt: log.startedAt, lines: [...log.lines, ...logLines] }));
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: ZIP_MIME });
  return { blob, added, missing, unsupported, logLines };
}
