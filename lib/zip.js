import { MISSING_REPORT_NAME, missingReport } from './profile.js';

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

// → ArrayBuffer, or null once the fetch failed for good; transient failures are retried with backoff.
async function fetchBytes(fetch, url, delay) {
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
    if (!isRetryable(failure)) {
      break;
    }
  }
  console.warn(typeof failure === 'number' ? `photo fetch failed: HTTP ${failure}` : 'photo fetch failed');
  return null;
}

// → { blob: Blob|null, added: number, missing: string[] }; blob is null when nothing was added.
// onProgress(done, total) runs after each entry's last fetch attempt, successful or not.
export async function buildZip(entries, {
  JSZip, fetch, limit = FETCH_CONCURRENCY, reports = [], delay = sleep, onProgress = () => {},
}) {
  let done = 0;
  const bytes = await mapWithLimit(entries, limit, async ({ url }) => {
    const result = await fetchBytes(fetch, url, delay);
    onProgress(++done, entries.length);
    return result;
  });
  const zip = new JSZip();
  const missing = [];
  entries.forEach(({ url, name }, index) => {
    if (bytes[index]) {
      zip.file(name, bytes[index]);
    } else {
      missing.push(url);
    }
  });
  const added = entries.length - missing.length;
  if (added === 0) {
    return { blob: null, added, missing };
  }
  if (missing.length > 0) {
    zip.file(MISSING_REPORT_NAME, missingReport(missing));
  }
  for (const { name, text } of reports) {
    zip.file(name, text);
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: ZIP_MIME });
  return { blob, added, missing };
}
