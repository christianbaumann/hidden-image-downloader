import { MISSING_REPORT_NAME, missingReport } from './profile.js';

export const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 30000;
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

// → ArrayBuffer, or null when the response is not ok or the fetch throws.
async function fetchBytes(fetch, url) {
  try {
    const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      return await response.arrayBuffer();
    }
    console.warn(`photo fetch failed: HTTP ${response.status}`);
  } catch {
    console.warn('photo fetch failed');
  }
  return null;
}

// → { blob: Blob|null, added: number, missing: string[] }; blob is null when nothing was added.
export async function buildZip(entries, { JSZip, fetch, limit = FETCH_CONCURRENCY, reports = [] }) {
  const bytes = await mapWithLimit(entries, limit, ({ url }) => fetchBytes(fetch, url));
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
