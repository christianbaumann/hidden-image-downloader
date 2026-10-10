export const SAVED_KEY_PREFIX = 'saved:';
export const PENDING_KEY_PREFIX = 'pending:';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;
const HASH_HEX_LENGTH = 8;

export const savedKey = (userId) => `${SAVED_KEY_PREFIX}${userId}`;
export const pendingKey = (downloadId) => `${PENDING_KEY_PREFIX}${downloadId}`;

// FNV-1a over the UTF-16 code units: detects a change, nothing more.
export function fingerprint(text) {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX_RADIX).padStart(HASH_HEX_LENGTH, '0');
}

// A field counts as new when the request has it and it differs from the saved one.
function changed(request, saved, field) {
  return Boolean(request[field]) && request[field] !== saved?.[field];
}

function isSaved(entry, photos, attachments, videos) {
  if (entry.photoKey) {
    return photos.has(entry.photoKey);
  }
  if (entry.videoId) {
    return videos.has(entry.videoId);
  }
  return Boolean(entry.attachmentId) && attachments.has(entry.attachmentId);
}

// request: a ZIP request whose entries carry photoKey, videoId or attachmentId, plus lastMessageId and profileTextHash;
// saved: { photos, videos, attachments, lastMessageId, profileTextHash } or undefined (nothing saved yet, or a full download).
// → { request: the request with only unsaved entries, nothingNew }; names, numbers and reports stay unchanged.
// An entry without photoKey, videoId and attachmentId cannot be recorded, so it always counts as new.
export function filterNewEntries(request, saved) {
  const photos = new Set(saved?.photos ?? []);
  const attachments = new Set(saved?.attachments ?? []);
  const videos = new Set(saved?.videos ?? []);
  const entries = request.entries.filter((entry) => !isSaved(entry, photos, attachments, videos));
  const newText = changed(request, saved, 'lastMessageId') || changed(request, saved, 'profileTextHash');
  return { request: { ...request, entries }, nothingNew: entries.length === 0 && !newText };
}

// The record of one finished build: every entry not missing. An unsupported video counts as handled, so it is not retried.
export function savedRecord(entries, missingUrls, lastMessageId, profileTextHash) {
  const missing = new Set(missingUrls);
  const added = entries.filter((entry) => !missing.has(entry.url));
  const videos = added.map((entry) => entry.videoId).filter(Boolean);
  return {
    photos: added.map((entry) => entry.photoKey).filter(Boolean),
    attachments: added.map((entry) => entry.attachmentId).filter(Boolean),
    ...(videos.length > 0 ? { videos } : {}),
    ...(lastMessageId ? { lastMessageId } : {}),
    ...(profileTextHash ? { profileTextHash } : {}),
  };
}

// saved ∪ record; the record's lastMessageId and profileTextHash win when it has them. videos only when there are any.
export function mergeRecord(saved, record) {
  const videos = [...new Set([...(saved?.videos ?? []), ...(record.videos ?? [])])];
  const lastMessageId = record.lastMessageId ?? saved?.lastMessageId;
  const profileTextHash = record.profileTextHash ?? saved?.profileTextHash;
  return {
    photos: [...new Set([...(saved?.photos ?? []), ...record.photos])],
    attachments: [...new Set([...(saved?.attachments ?? []), ...record.attachments])],
    ...(videos.length > 0 ? { videos } : {}),
    ...(lastMessageId ? { lastMessageId } : {}),
    ...(profileTextHash ? { profileTextHash } : {}),
  };
}
