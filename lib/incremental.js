export const SAVED_KEY_PREFIX = 'saved:';
export const PENDING_KEY_PREFIX = 'pending:';

export const savedKey = (userId) => `${SAVED_KEY_PREFIX}${userId}`;
export const pendingKey = (downloadId) => `${PENDING_KEY_PREFIX}${downloadId}`;

function isSaved(entry, photos, attachments) {
  if (entry.photoKey) {
    return photos.has(entry.photoKey);
  }
  return Boolean(entry.attachmentId) && attachments.has(entry.attachmentId);
}

// request: a ZIP request whose entries carry photoKey or attachmentId, plus lastMessageId;
// saved: { photos, attachments, lastMessageId } or undefined (nothing saved yet, or a full download).
// → { request: the request with only unsaved entries, nothingNew }; names, numbers and reports stay unchanged.
// An entry without photoKey and attachmentId cannot be recorded, so it always counts as new.
export function filterNewEntries(request, saved) {
  const photos = new Set(saved?.photos ?? []);
  const attachments = new Set(saved?.attachments ?? []);
  const entries = request.entries.filter((entry) => !isSaved(entry, photos, attachments));
  const newMessages = Boolean(request.lastMessageId) && request.lastMessageId !== saved?.lastMessageId;
  return { request: { ...request, entries }, nothingNew: entries.length === 0 && !newMessages };
}

// The record of one finished build: every entry that made it into the ZIP (missing URLs left out).
export function savedRecord(entries, missingUrls, lastMessageId) {
  const missing = new Set(missingUrls);
  const added = entries.filter((entry) => !missing.has(entry.url));
  return {
    photos: added.map((entry) => entry.photoKey).filter(Boolean),
    attachments: added.map((entry) => entry.attachmentId).filter(Boolean),
    ...(lastMessageId ? { lastMessageId } : {}),
  };
}

// saved ∪ record; the record's lastMessageId wins when it has one.
export function mergeRecord(saved, record) {
  const lastMessageId = record.lastMessageId ?? saved?.lastMessageId;
  return {
    photos: [...new Set([...(saved?.photos ?? []), ...record.photos])],
    attachments: [...new Set([...(saved?.attachments ?? []), ...record.attachments])],
    ...(lastMessageId ? { lastMessageId } : {}),
  };
}
