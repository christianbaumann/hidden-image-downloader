export const LOG_FILENAME = 'hidden-image-downloader-log.txt';
export const ZIP_LOG_NAME = 'log.txt';
const LOG_TITLE = 'Hidden Image Downloader log';
const FIELD_SEPARATOR = '  ';

// URL without query and fragment: ClubMail attachment URLs carry ids there.
export function stripQuery(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

// One log per click. Lines hold only what is passed as step, entry, status, reason and url: never tokens or message text.
// startedAt: the click time, for a log that continues another one (the offscreen document's fetches).
export function createLog(now = Date.now, startedAt = now()) {
  const lines = [];
  return {
    startedAt,
    lines,
    add(step, { entry, status, reason, url } = {}) {
      lines.push({ ms: now() - startedAt, step, entry, status, reason, url: url && stripQuery(url) });
    },
    append(more) {
      lines.push(...more);
    },
  };
}

function renderLine({ ms, step, entry, status, reason, url }) {
  return [
    `+${ms} ms`,
    step,
    ...(entry ? [`entry=${entry}`] : []),
    ...(status === undefined ? [] : [`status=${status}`]),
    ...(reason ? [`reason=${reason}`] : []),
    ...(url ? [`url=${url}`] : []),
  ].join(FIELD_SEPARATOR);
}

export function renderLog(log) {
  return [
    LOG_TITLE,
    `started: ${new Date(log.startedAt).toISOString()}`,
    '',
    ...log.lines.map(renderLine),
    '',
  ].join('\n');
}

export function logDataUrl(text) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}
