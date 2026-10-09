import { MISSING_REPORT_NAME, missingReport } from './profile.js';
import { ZIP_LOG_NAME, createLog, renderLog } from './log.js';

export const FETCH_CONCURRENCY = 5;
export const FETCH_RETRIES = 2;
export const RETRY_BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const ZIP_MIME = 'application/zip';

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
async function fetchBytes(fetch, entry, delay, log) {
  const { url } = entry;
  let failure;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
    log.add('photo: retry', failureFields(failure, entry));
  }
  log.add('photo: missing', failureFields(failure, entry));
  console.warn(typeof failure === 'number' ? `photo fetch failed: HTTP ${failure}` : 'photo fetch failed');
  return null;
}

// → { blob: Blob|null, added: number, missing: string[], logLines }; blob is null when no entry was added,
// unless there were no entries and reports exist (a ZIP of reports only).
// root: folder that holds every file, so all ZIPs extract into one top folder.
// onProgress(done, total) runs after each entry's last fetch attempt, successful or not.
// log: { startedAt, lines } of the click so far. logLines: the retries and failures of the fetches.
// log.txt (click log plus logLines) is written when photos are missing or `warning` is set.
export async function buildZip(entries, {
  JSZip, fetch, limit = FETCH_CONCURRENCY, reports = [], root, delay = sleep, onProgress = () => {},
  log = { startedAt: Date.now(), lines: [] }, warning = false,
}) {
  const fetchLog = createLog(Date.now, log.startedAt);
  let done = 0;
  const bytes = await mapWithLimit(entries, limit, async (entry) => {
    const result = await fetchBytes(fetch, entry, delay, fetchLog);
    onProgress(++done, entries.length);
    return result;
  });
  const zip = new JSZip();
  const folder = root ? zip.folder(root) : zip;
  const missing = [];
  entries.forEach(({ url, name }, index) => {
    if (bytes[index]) {
      folder.file(name, bytes[index]);
    } else {
      missing.push(url);
    }
  });
  const added = entries.length - missing.length;
  const logLines = fetchLog.lines;
  if (added === 0 && (entries.length > 0 || reports.length === 0)) {
    return { blob: null, added, missing, logLines };
  }
  if (missing.length > 0) {
    folder.file(MISSING_REPORT_NAME, missingReport(missing));
  }
  for (const { name, text } of reports) {
    folder.file(name, text);
  }
  if (missing.length > 0 || warning) {
    folder.file(ZIP_LOG_NAME, renderLog({ startedAt: log.startedAt, lines: [...log.lines, ...logLines] }));
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: ZIP_MIME });
  return { blob, added, missing, logLines };
}
