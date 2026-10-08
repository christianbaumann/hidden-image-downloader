export const MAX_TITLE_LENGTH = 80;
const UNKNOWN_OWNER = 'unknown';
const FALLBACK_TITLE = 'image';
const PHOTO_ID_PREFIX = 'photo-';
const FALLBACK_EXTENSION = 'jpg';
const MAX_EXTENSION_LENGTH = 4;
const PLACEHOLDER_TITLES = ['...', '…'];

const WHITESPACE_RUN = /\s+/g;
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
const EDGE_JUNK = /^[\s._-]+|[\s._-]+$/g;
const EXTENSION = new RegExp(`\\.([a-z0-9]{1,${MAX_EXTENSION_LENGTH}})$`, 'i');

function trimEdges(text) {
  return text.replace(EDGE_JUNK, '');
}

export function sanitizeSegment(text, maxLength = Infinity) {
  if (text === null || text === undefined) return '';
  const cleaned = trimEdges(
    String(text).replace(WHITESPACE_RUN, '-').replace(FORBIDDEN_CHARS, '_'),
  );
  const codePoints = Array.from(cleaned);
  if (codePoints.length <= maxLength) return cleaned;
  return trimEdges(codePoints.slice(0, maxLength).join(''));
}

function pad(number) {
  return String(number).padStart(2, '0');
}

export function formatTimestamp(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}_${time}`;
}

export function extensionFromUrl(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return FALLBACK_EXTENSION;
  }
  const lastSegment = pathname.split('/').pop();
  const match = EXTENSION.exec(lastSegment);
  return match ? match[1].toLowerCase() : FALLBACK_EXTENSION;
}

export function pickTitle(title, photoId) {
  const trimmed = (title ?? '').trim();
  if (trimmed && !PLACEHOLDER_TITLES.includes(trimmed)) return trimmed;
  return photoId ? `${PHOTO_ID_PREFIX}${photoId}` : FALLBACK_TITLE;
}

export function buildFilename({ owner, title, photoId, url, date }) {
  const ownerPart = sanitizeSegment(owner) || UNKNOWN_OWNER;
  const titlePart = sanitizeSegment(pickTitle(title, photoId), MAX_TITLE_LENGTH)
    || sanitizeSegment(pickTitle(null, photoId), MAX_TITLE_LENGTH);
  return `${ownerPart}_${titlePart}_${formatTimestamp(date)}.${extensionFromUrl(url)}`;
}
