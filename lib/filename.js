export const MAX_TITLE_LENGTH = 80;
export const UNKNOWN_OWNER = 'unknown';
export const FALLBACK_FOLDER = 'album';
const MAX_FOLDER_LENGTH = 80;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const RESERVED_SUFFIX = '_';
const DUPLICATE_SEPARATOR = '-';
const FIRST_DUPLICATE_NUMBER = 2;
const ENTRY_NUMBER_MIN_WIDTH = 2;
const FALLBACK_TITLE = 'image';
const PHOTO_ID_PREFIX = 'photo-';
const FALLBACK_EXTENSION = 'jpg';
const MAX_EXTENSION_LENGTH = 4;
const PLACEHOLDER_TITLES = ['...', '…'];

const WHITESPACE_RUN = /\s+/g;
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F\u007F\p{Cf}]/gu;
const EDGE_JUNK = /^[\s.~_-]+|[\s._-]+$/g;
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

// NFC, sanitised, capped; '' when nothing usable is left; Windows device names get a trailing '_'.
export function folderSegment(text) {
  const segment = sanitizeSegment(String(text ?? '').normalize('NFC'), MAX_FOLDER_LENGTH);
  return RESERVED_WINDOWS_NAME.test(segment) ? `${segment}${RESERVED_SUFFIX}` : segment;
}

// name, or name-2, name-3 … ; compares case-insensitively; records the result in `taken` (lower-cased).
export function reserveUniqueName(name, taken) {
  let unique = name;
  for (let number = FIRST_DUPLICATE_NUMBER; taken.has(unique.toLowerCase()); number += 1) {
    unique = `${name}${DUPLICATE_SEPARATOR}${number}`;
  }
  taken.add(unique.toLowerCase());
  return unique;
}

// 0-based index → 1-based number, zero-padded to the width of count (at least 2 digits).
export function entryNumber(index, count) {
  return String(index + 1).padStart(Math.max(ENTRY_NUMBER_MIN_WIDTH, String(count).length), '0');
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
